import { AudioMetadata } from '../../types/project';
import { useProjectStore } from '../../store/useProjectStore';
import { extractWaveformPeaks } from './waveform';

export class AudioDecodeError extends Error {
  public readonly code: 'EMPTY_FILE' | 'UNSUPPORTED_FORMAT' | 'DECODE_FAILED' | 'WEB_AUDIO_UNAVAILABLE';

  constructor(
    code: 'EMPTY_FILE' | 'UNSUPPORTED_FORMAT' | 'DECODE_FAILED' | 'WEB_AUDIO_UNAVAILABLE',
    message: string
  ) {
    super(message);
    this.name = 'AudioDecodeError';
    this.code = code;
  }
}

const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm', '.mp4'];

export function isSupportedAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  const lower = file.name.toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

class AudioEngineService {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private audioBuffer: AudioBuffer | null = null;

  // Master clock anchors
  private startContextTime = 0;
  private startSongOffset = 0;
  private rafId: number | null = null;
  private isPlayingInternal = false;

  private ensureContext(): AudioContext {
    if (typeof window === 'undefined') {
      throw new AudioDecodeError('WEB_AUDIO_UNAVAILABLE', 'Trình duyệt không hỗ trợ môi trường Window.');
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) {
      throw new AudioDecodeError(
        'WEB_AUDIO_UNAVAILABLE',
        'Trình duyệt của bạn không hỗ trợ Web Audio API.'
      );
    }

    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioCtx();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }

    return this.audioContext;
  }

  public async decodeAudioFile(
    file: File | Blob,
    explicitName?: string
  ): Promise<{ buffer: AudioBuffer; metadata: AudioMetadata; peaks: number[] }> {
    if (!file || file.size === 0) {
      throw new AudioDecodeError('EMPTY_FILE', 'File âm thanh rỗng (0 byte). Vui lòng chọn file hợp lệ.');
    }

    const fileName = explicitName || (file instanceof File ? file.name : 'audio-track');
    if (file instanceof File && !isSupportedAudioFile(file)) {
      throw new AudioDecodeError(
        'UNSUPPORTED_FORMAT',
        `Định dạng file "${fileName}" không được hỗ trợ. Hãy dùng MP3, WAV, M4A, OGG hoặc FLAC.`
      );
    }

    this.pause();

    const ctx = this.ensureContext();
    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch {
      throw new AudioDecodeError('DECODE_FAILED', 'Không thể đọc dữ liệu từ file âm thanh.');
    }

    try {
      // Clone buffer slice to prevent detached ArrayBuffer issues in some browsers
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      this.audioBuffer = decodedBuffer;
      this.startSongOffset = 0;

      const peaks = extractWaveformPeaks(decodedBuffer, 1400);
      const metadata: AudioMetadata = {
        fileName,
        duration: decodedBuffer.duration,
        sampleRate: decodedBuffer.sampleRate,
        numberOfChannels: decodedBuffer.numberOfChannels,
        fileSize: file.size,
        mimeType: file.type || 'audio/mpeg',
      };

      const { project } = useProjectStore.getState();
      this.setVolume(project.settings.musicVolume, project.settings.isMuted);

      return { buffer: decodedBuffer, metadata, peaks };
    } catch {
      throw new AudioDecodeError(
        'DECODE_FAILED',
        `Trình duyệt không thể giải mã file "${fileName}". File có thể bị hỏng hoặc dùng codec lạ.`
      );
    }
  }

  public getAudioBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Master Clock Calculation:
   * songTime = audioContext.currentTime - startContextTime + startSongOffset (scaled by playbackRate)
   */
  public getCurrentTime(): number {
    if (!this.isPlayingInternal || !this.audioContext) {
      return this.startSongOffset;
    }
    const { playbackRate, duration } = useProjectStore.getState();
    const elapsedContext = this.audioContext.currentTime - this.startContextTime;
    const songTime = elapsedContext * playbackRate + this.startSongOffset;
    return Math.max(0, Math.min(duration, songTime));
  }

  public async play(fromTime?: number): Promise<void> {
    const store = useProjectStore.getState();
    const ctx = this.ensureContext();

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    this.stopSourceNode();

    const duration = this.audioBuffer ? this.audioBuffer.duration : store.duration;
    const trimStart = store.project.settings.trimStart || 0;
    const trimEnd = store.project.settings.trimEnd ?? duration;

    let targetOffset = fromTime !== undefined ? fromTime : store.currentTime;
    if (targetOffset >= trimEnd - 0.05 || targetOffset >= duration - 0.05) {
      targetOffset = trimStart;
    }
    targetOffset = Math.max(0, Math.min(duration, targetOffset));

    this.startSongOffset = targetOffset;
    this.startContextTime = ctx.currentTime;
    this.isPlayingInternal = true;

    if (this.audioBuffer && this.gainNode) {
      const source = ctx.createBufferSource();
      source.buffer = this.audioBuffer;
      source.playbackRate.value = store.playbackRate;
      source.connect(this.gainNode);

      const effectiveGain = store.project.settings.isMuted ? 0 : store.project.settings.musicVolume;
      this.gainNode.gain.setValueAtTime(effectiveGain, ctx.currentTime);

      source.start(0, targetOffset);
      this.sourceNode = source;
    }

    store.setCurrentTime(targetOffset);
    store.setIsPlaying(true);
    this.startClockLoop();
  }

  public pause(): void {
    if (this.isPlayingInternal) {
      this.startSongOffset = this.getCurrentTime();
    }
    this.isPlayingInternal = false;
    this.stopSourceNode();
    this.stopClockLoop();

    const store = useProjectStore.getState();
    store.setCurrentTime(this.startSongOffset);
    store.setIsPlaying(false);
  }

  public async togglePlay(): Promise<void> {
    if (this.isPlayingInternal) {
      this.pause();
    } else {
      await this.play();
    }
  }

  public seek(targetTime: number): void {
    const store = useProjectStore.getState();
    const duration = this.audioBuffer ? this.audioBuffer.duration : store.duration;
    const clamped = Math.max(0, Math.min(duration, targetTime));

    this.startSongOffset = clamped;
    store.setCurrentTime(clamped);

    if (this.isPlayingInternal) {
      void this.play(clamped);
    }
  }

  public setVolume(volume: number, muted = false): void {
    const clampedVolume = Math.max(0, Math.min(1.5, volume));
    const store = useProjectStore.getState();
    store.updateSettings({ musicVolume: clampedVolume, isMuted: muted });

    if (this.gainNode && this.audioContext) {
      const effectiveGain = muted ? 0 : clampedVolume;
      this.gainNode.gain.setTargetAtTime(effectiveGain, this.audioContext.currentTime, 0.015);
    }
  }

  public setPlaybackRate(rate: 0.5 | 0.75 | 1): void {
    const currentSongTime = this.getCurrentTime();
    const store = useProjectStore.getState();
    store.setPlaybackRate(rate);

    if (this.isPlayingInternal && this.audioContext) {
      this.startSongOffset = currentSongTime;
      this.startContextTime = this.audioContext.currentTime;
      if (this.sourceNode) {
        this.sourceNode.playbackRate.setValueAtTime(rate, this.audioContext.currentTime);
      }
    }
  }

  private startClockLoop(): void {
    this.stopClockLoop();

    const tick = () => {
      if (!this.isPlayingInternal) return;

      const store = useProjectStore.getState();
      const songTime = this.getCurrentTime();
      const duration = this.audioBuffer ? this.audioBuffer.duration : store.duration;
      const trimEnd = store.project.settings.trimEnd ?? duration;
      const loopRegion = store.loopRegion;

      // Handle active loop region
      if (loopRegion && loopRegion.end > loopRegion.start + 0.2 && songTime >= loopRegion.end) {
        this.seek(loopRegion.start);
        return;
      }

      // Handle reaching trimEnd or end of track
      if (songTime >= Math.min(duration, trimEnd)) {
        this.startSongOffset = Math.min(duration, trimEnd);
        this.pause();
        return;
      }

      store.setCurrentTime(songTime);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private stopClockLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private stopSourceNode(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // Ignore if source had already stopped
      }
      this.sourceNode = null;
    }
  }

  public async dispose(): Promise<void> {
    this.pause();
    this.audioBuffer = null;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;
    this.gainNode = null;
  }
}

export const audioEngine = new AudioEngineService();
