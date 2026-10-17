import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import { KaraokeProject } from '../../types/project';
import { getCanvasDimensions } from '../../utils/constants';
import { audioEngine } from '../audio-engine/audioEngine';
import { backgroundAssetCache } from '../renderer/backgroundAssetCache';
import { renderKaraokeFrame } from '../renderer/karaokeRenderer';
import { ExportEngineKind, probeExportPipeline } from './capabilities';

export interface ExportProgressInfo {
  phase: 'probing' | 'encoding-video' | 'encoding-audio' | 'muxing' | 'completed';
  percent: number;
  encodedFrames: number;
  totalFrames: number;
  etaSeconds: number | null;
  activeEngine: ExportEngineKind;
  container: 'mp4' | 'webm';
  fallbackNotice?: string;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  container: 'mp4' | 'webm';
  engine: ExportEngineKind;
  fallbackNotice?: string;
}

export class ExportCancelledError extends Error {
  constructor() {
    super('Đã hủy quá trình xuất video.');
    this.name = 'ExportCancelledError';
  }
}

function buildTrimmedPlanarAudio(
  sourceBuffer: AudioBuffer,
  trimStart: number,
  trimEnd: number,
  volume: number,
  isMuted: boolean
): {
  planarChannels: Float32Array[];
  sampleRate: number;
  numberOfChannels: number;
  totalSamples: number;
} {
  const sampleRate = sourceBuffer.sampleRate;
  const numberOfChannels = Math.min(2, sourceBuffer.numberOfChannels);
  const startSample = Math.max(0, Math.floor(trimStart * sampleRate));
  const endSample = Math.min(sourceBuffer.length, Math.ceil(trimEnd * sampleRate));
  const totalSamples = Math.max(0, endSample - startSample);
  const effectiveGain = isMuted ? 0 : volume;

  const planarChannels: Float32Array[] = [];
  for (let c = 0; c < numberOfChannels; c++) {
    const src = sourceBuffer.getChannelData(c);
    const slice = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      const sample = src[startSample + i] * effectiveGain;
      slice[i] = Math.max(-1, Math.min(1, sample));
    }
    planarChannels.push(slice);
  }

  return {
    planarChannels,
    sampleRate,
    numberOfChannels,
    totalSamples,
  };
}

async function encodeAudioBufferWithWebCodecs(
  audioEncoder: AudioEncoder,
  sourceBuffer: AudioBuffer,
  trimStart: number,
  trimEnd: number,
  volume: number,
  isMuted: boolean,
  signal: AbortSignal
): Promise<void> {
  const { planarChannels, sampleRate, numberOfChannels, totalSamples } =
    buildTrimmedPlanarAudio(sourceBuffer, trimStart, trimEnd, volume, isMuted);

  if (totalSamples === 0) return;

  const chunkFrames = 4096;
  for (let offset = 0; offset < totalSamples; offset += chunkFrames) {
    if (signal.aborted) {
      throw new ExportCancelledError();
    }

    const frameCount = Math.min(chunkFrames, totalSamples - offset);
    const combinedPlanar = new Float32Array(frameCount * numberOfChannels);

    for (let c = 0; c < numberOfChannels; c++) {
      const channelSlice = planarChannels[c].subarray(offset, offset + frameCount);
      combinedPlanar.set(channelSlice, c * frameCount);
    }

    const timestampUs = Math.round((offset / sampleRate) * 1_000_000);
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: frameCount,
      numberOfChannels,
      timestamp: timestampUs,
      data: combinedPlanar,
    });

    try {
      audioEncoder.encode(audioData);
    } finally {
      audioData.close();
    }

    while (audioEncoder.encodeQueueSize > 16) {
      if (signal.aborted) throw new ExportCancelledError();
      await new Promise((r) => setTimeout(r, 4));
    }
  }

  await audioEncoder.flush();
}

async function runWebCodecsExport(
  project: KaraokeProject,
  language: 'vi' | 'en',
  onProgress: (info: ExportProgressInfo) => void,
  signal: AbortSignal
): Promise<ExportResult> {
  const { settings, exportSettings } = project;
  const { width, height } = getCanvasDimensions(settings.aspectRatio, settings.resolution);
  const fps = exportSettings.fps || settings.fps || 30;

  let audioBuffer = audioEngine.getAudioBuffer();
  if (!audioBuffer && project.audioFileRef) {
    const decoded = await audioEngine.decodeAudioFile(project.audioFileRef);
    audioBuffer = decoded.buffer;
  }

  const trackDuration = audioBuffer
    ? audioBuffer.duration
    : project.audioMetadata?.duration || 12;
  const trimStart = Math.max(0, settings.trimStart || 0);
  const trimEnd = Math.min(
    trackDuration,
    settings.trimEnd !== null && settings.trimEnd > trimStart
      ? settings.trimEnd
      : trackDuration
  );
  const exportDuration = Math.max(0.5, trimEnd - trimStart);
  const totalFrames = Math.max(1, Math.ceil(exportDuration * fps));

  const sampleRate = audioBuffer ? audioBuffer.sampleRate : 48000;
  const numberOfChannels = audioBuffer ? Math.min(2, audioBuffer.numberOfChannels) : 2;

  const probed = await probeExportPipeline(
    exportSettings.format,
    width,
    height,
    fps,
    exportSettings.videoBitrate,
    exportSettings.audioBitrate,
    sampleRate,
    numberOfChannels
  );

  if (probed.engine === 'mediarecorder-webm') {
    return runMediaRecorderFallbackExport(
      project,
      audioBuffer,
      trimStart,
      trimEnd,
      width,
      height,
      fps,
      language === 'vi' ? probed.fallbackReasonVi : probed.fallbackReasonEn,
      onProgress,
      signal
    );
  }

  if (probed.engine === 'unsupported') {
    throw new Error(
      language === 'vi'
        ? probed.fallbackReasonVi || 'Trình duyệt không hỗ trợ xuất video.'
        : probed.fallbackReasonEn || 'Video export is not supported in this browser.'
    );
  }

  const fallbackNotice =
    language === 'vi' ? probed.fallbackReasonVi : probed.fallbackReasonEn;

  const hasAudioTrack = Boolean(audioBuffer && probed.audioCodec);
  const isMp4 = probed.container === 'mp4';

  const mp4Target = isMp4 ? new Mp4ArrayBufferTarget() : null;
  const mp4Muxer =
    isMp4 && mp4Target
      ? new Mp4Muxer({
          target: mp4Target,
          video: {
            codec: 'avc',
            width,
            height,
          },
          audio: hasAudioTrack
            ? {
                codec: 'aac',
                sampleRate,
                numberOfChannels,
              }
            : undefined,
          fastStart: 'in-memory',
        })
      : null;

  const webmTarget = !isMp4 ? new WebmArrayBufferTarget() : null;
  const webmMuxer =
    !isMp4 && webmTarget
      ? new WebmMuxer({
          target: webmTarget,
          video: {
            codec: probed.videoCodec.startsWith('vp09') ? 'V_VP9' : 'V_VP8',
            width,
            height,
            frameRate: fps,
          },
          audio: hasAudioTrack
            ? {
                codec: 'A_OPUS',
                sampleRate: 48000,
                numberOfChannels,
              }
            : undefined,
        })
      : null;

  let encoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (mp4Muxer) {
        mp4Muxer.addVideoChunk(chunk, meta);
      } else if (webmMuxer) {
        webmMuxer.addVideoChunk(chunk, meta);
      }
    },
    error: (err) => {
      encoderError = new Error(`Lỗi VideoEncoder: ${err.message}`);
    },
  });

  videoEncoder.configure({
    codec: probed.videoCodec,
    width,
    height,
    framerate: fps,
    bitrate: exportSettings.videoBitrate,
    ...(isMp4 ? { avc: { format: 'avc' } } : {}),
  });

  let audioEncoder: AudioEncoder | null = null;
  if (hasAudioTrack && probed.audioCodec) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        if (mp4Muxer) {
          mp4Muxer.addAudioChunk(chunk, meta);
        } else if (webmMuxer) {
          webmMuxer.addAudioChunk(chunk, meta);
        }
      },
      error: (err) => {
        encoderError = new Error(`Lỗi AudioEncoder: ${err.message}`);
      },
    });

    audioEncoder.configure({
      codec: probed.audioCodec,
      sampleRate: isMp4 ? sampleRate : 48000,
      numberOfChannels,
      bitrate: exportSettings.audioBitrate,
    });
  }

  const renderCanvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });

  const renderCtx = renderCanvas.getContext('2d');
  if (!renderCtx) {
    throw new Error('Không thể khởi tạo ngữ cảnh đồ họa 2D để kết xuất video.');
  }

  const startWallTime = performance.now();

  try {
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      if (signal.aborted) {
        throw new ExportCancelledError();
      }
      if (encoderError) {
        throw encoderError;
      }

      const relativeTime = frameIndex / fps;
      const songTime = trimStart + relativeTime;

      let explicitVideoEl: HTMLVideoElement | null | undefined = undefined;
      if (settings.background.type === 'video' && settings.background.assetUrl) {
        explicitVideoEl = await backgroundAssetCache.seekVideoDeterministic(
          settings.background.assetUrl,
          songTime
        );
      }

      renderKaraokeFrame(renderCtx, {
        project,
        songTime,
        width,
        height,
        isPlaying: false,
        isExporting: true,
        explicitVideoElement: explicitVideoEl,
      });

      const timestampUs = Math.round(relativeTime * 1_000_000);
      const durationUs = Math.round((1 / fps) * 1_000_000);

      const videoFrame = new VideoFrame(renderCanvas, {
        timestamp: timestampUs,
        duration: durationUs,
      });

      try {
        const isKeyFrame = frameIndex % (fps * 2) === 0;
        videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
      } finally {
        videoFrame.close();
      }

      while (videoEncoder.encodeQueueSize > 8) {
        if (signal.aborted) throw new ExportCancelledError();
        await new Promise((r) => setTimeout(r, 4));
      }

      if (frameIndex % 3 === 0 || frameIndex === totalFrames - 1) {
        const elapsedSec = (performance.now() - startWallTime) / 1000;
        const framesDone = frameIndex + 1;
        const fpsRate = framesDone / Math.max(0.1, elapsedSec);
        const remainingFrames = totalFrames - framesDone;
        const etaSeconds = Math.max(0, Math.round(remainingFrames / Math.max(0.5, fpsRate)));

        onProgress({
          phase: 'encoding-video',
          percent: Math.min(92, Math.round((framesDone / totalFrames) * 90)),
          encodedFrames: framesDone,
          totalFrames,
          etaSeconds,
          activeEngine: probed.engine,
          container: probed.container,
          fallbackNotice,
        });

        await new Promise((r) => setTimeout(r, 0));
      }
    }

    await videoEncoder.flush();

    if (audioEncoder && audioBuffer && isMp4) {
      onProgress({
        phase: 'encoding-audio',
        percent: 94,
        encodedFrames: totalFrames,
        totalFrames,
        etaSeconds: 2,
        activeEngine: probed.engine,
        container: probed.container,
        fallbackNotice,
      });

      await encodeAudioBufferWithWebCodecs(
        audioEncoder,
        audioBuffer,
        trimStart,
        trimEnd,
        settings.musicVolume,
        Boolean(settings.isMuted),
        signal
      );
    } else if (audioEncoder && audioBuffer && !isMp4 && audioBuffer.sampleRate === 48000) {
      await encodeAudioBufferWithWebCodecs(
        audioEncoder,
        audioBuffer,
        trimStart,
        trimEnd,
        settings.musicVolume,
        Boolean(settings.isMuted),
        signal
      );
    }

    if (encoderError) {
      throw encoderError;
    }

    onProgress({
      phase: 'muxing',
      percent: 98,
      encodedFrames: totalFrames,
      totalFrames,
      etaSeconds: 1,
      activeEngine: probed.engine,
      container: probed.container,
      fallbackNotice,
    });

    let outputBlob: Blob;
    if (mp4Muxer && mp4Target) {
      mp4Muxer.finalize();
      outputBlob = new Blob([mp4Target.buffer], { type: 'video/mp4' });
    } else if (webmMuxer && webmTarget) {
      webmMuxer.finalize();
      outputBlob = new Blob([webmTarget.buffer], { type: 'video/webm' });
    } else {
      throw new Error('Không thể đóng gói container video.');
    }

    onProgress({
      phase: 'completed',
      percent: 100,
      encodedFrames: totalFrames,
      totalFrames,
      etaSeconds: 0,
      activeEngine: probed.engine,
      container: probed.container,
      fallbackNotice,
    });

    const safeName = (project.name || 'karaokeforge-video')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return {
      blob: outputBlob,
      filename: `${safeName || 'karaoke'}-${settings.resolution}.${probed.container}`,
      container: probed.container,
      engine: probed.engine,
      fallbackNotice,
    };
  } finally {
    try {
      if (videoEncoder.state !== 'closed') {
        videoEncoder.close();
      }
    } catch {}
    try {
      if (audioEncoder && audioEncoder.state !== 'closed') {
        audioEncoder.close();
      }
    } catch {}
  }
}

async function runMediaRecorderFallbackExport(
  project: KaraokeProject,
  audioBuffer: AudioBuffer | null,
  trimStart: number,
  trimEnd: number,
  width: number,
  height: number,
  fps: number,
  fallbackNotice: string | undefined,
  onProgress: (info: ExportProgressInfo) => void,
  signal: AbortSignal
): Promise<ExportResult> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Không thể khởi tạo Canvas cho MediaRecorder.');
  }

  const exportDuration = Math.max(0.5, trimEnd - trimStart);
  const totalFrames = Math.max(1, Math.ceil(exportDuration * fps));

  const canvasStream = canvas.captureStream(fps);
  const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

  let offlineAudioCtx: AudioContext | null = null;
  let sourceNode: AudioBufferSourceNode | null = null;

  if (audioBuffer) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      offlineAudioCtx = new AudioCtx();
      const dest = offlineAudioCtx.createMediaStreamDestination();
      const gain = offlineAudioCtx.createGain();
      gain.gain.value = project.settings.isMuted ? 0 : project.settings.musicVolume;

      sourceNode = offlineAudioCtx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(gain);
      gain.connect(dest);

      combinedTracks.push(...dest.stream.getAudioTracks());
    }
  }

  const combinedStream = new MediaStream(combinedTracks);
  const mimeCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const mimeType =
    mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: project.exportSettings.videoBitrate,
    audioBitsPerSecond: project.exportSettings.audioBitrate,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  return new Promise<ExportResult>((resolve, reject) => {
    let timerId: number | null = null;

    const cleanup = () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
      combinedTracks.forEach((t) => t.stop());
      try {
        sourceNode?.stop();
      } catch {}
      if (offlineAudioCtx && offlineAudioCtx.state !== 'closed') {
        void offlineAudioCtx.close();
      }
    };

    signal.addEventListener('abort', () => {
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch {}
      cleanup();
      reject(new ExportCancelledError());
    });

    recorder.onerror = () => {
      cleanup();
      reject(new Error('MediaRecorder gặp lỗi trong quá trình ghi hình.'));
    };

    recorder.onstop = () => {
      cleanup();
      if (signal.aborted) return;

      const blob = new Blob(chunks, { type: 'video/webm' });
      const safeName = (project.name || 'karaokeforge-video')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

      onProgress({
        phase: 'completed',
        percent: 100,
        encodedFrames: totalFrames,
        totalFrames,
        etaSeconds: 0,
        activeEngine: 'mediarecorder-webm',
        container: 'webm',
        fallbackNotice,
      });

      resolve({
        blob,
        filename: `${safeName || 'karaoke'}-${project.settings.resolution}.webm`,
        container: 'webm',
        engine: 'mediarecorder-webm',
        fallbackNotice,
      });
    };

    recorder.start(200);
    if (sourceNode && offlineAudioCtx) {
      sourceNode.start(0, trimStart, exportDuration);
    }

    const startWall = performance.now();
    const intervalMs = 1000 / fps;

    timerId = window.setInterval(() => {
      if (signal.aborted) return;
      const elapsedSec = (performance.now() - startWall) / 1000;
      const songTime = trimStart + elapsedSec;

      if (elapsedSec >= exportDuration) {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        return;
      }

      renderKaraokeFrame(ctx, {
        project,
        songTime,
        width,
        height,
        isPlaying: true,
        isExporting: true,
      });

      const currentFrame = Math.min(totalFrames, Math.floor(elapsedSec * fps));
      const eta = Math.max(0, Math.ceil(exportDuration - elapsedSec));

      onProgress({
        phase: 'encoding-video',
        percent: Math.min(99, Math.round((elapsedSec / exportDuration) * 100)),
        encodedFrames: currentFrame,
        totalFrames,
        etaSeconds: eta,
        activeEngine: 'mediarecorder-webm',
        container: 'webm',
        fallbackNotice,
      });
    }, intervalMs);
  });
}

export async function exportKaraokeVideo(
  project: KaraokeProject,
  language: 'vi' | 'en',
  onProgress: (info: ExportProgressInfo) => void,
  signal: AbortSignal
): Promise<ExportResult> {
  audioEngine.pause();

  onProgress({
    phase: 'probing',
    percent: 1,
    encodedFrames: 0,
    totalFrames: 100,
    etaSeconds: null,
    activeEngine: 'webcodecs-mp4',
    container: project.exportSettings.format,
  });

  return runWebCodecsExport(project, language, onProgress, signal);
}
