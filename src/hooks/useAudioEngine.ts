import { useCallback, useEffect, useState } from 'react';
import { audioEngine, AudioDecodeError } from '../features/audio-engine/audioEngine';
import {
  applyLineTapTimestamp,
  applyWordTapTimestamp,
  findActiveLineIndex,
} from '../features/timing-engine/timingEngine';
import { useProjectStore } from '../store/useProjectStore';
import { TaskStatus } from '../types/project';

export function useAudioEngine() {
  const [decodeStatus, setDecodeStatus] = useState<TaskStatus>('idle');
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const setAudioData = useProjectStore((s) => s.setAudioData);
  const addToast = useProjectStore((s) => s.addToast);
  const language = useProjectStore((s) => s.language);

  const loadAudioFile = useCallback(
    async (file: File | Blob, explicitName?: string) => {
      setDecodeStatus('loading');
      setDecodeError(null);

      try {
        const { metadata, peaks } = await audioEngine.decodeAudioFile(file, explicitName);
        setAudioData(file, metadata, peaks);
        setDecodeStatus('success');

        addToast({
          type: 'success',
          title: language === 'vi' ? 'Đã tải âm thanh thành công' : 'Audio loaded successfully',
          description:
            metadata.fileName +
            ' (' +
            metadata.sampleRate +
            ' Hz, ' +
            metadata.numberOfChannels +
            'ch)',
        });
      } catch (err) {
        const message =
          err instanceof AudioDecodeError
            ? err.message
            : language === 'vi'
            ? 'Đã xảy ra lỗi không xác định khi giải mã âm thanh.'
            : 'Unexpected error while decoding audio file.';

        setDecodeStatus('error');
        setDecodeError(message);
        addToast({
          type: 'error',
          title: language === 'vi' ? 'Lỗi giải mã âm thanh' : 'Audio Decode Error',
          description: message,
        });
      }
    },
    [setAudioData, addToast, language]
  );

  const seekToCurrentLineStart = useCallback(() => {
    const { project, currentTime } = useProjectStore.getState();
    const { activeIndex, prevIndex } = findActiveLineIndex(project.lyrics, currentTime);
    if (activeIndex !== -1 && project.lyrics[activeIndex]?.startTime !== null) {
      audioEngine.seek(project.lyrics[activeIndex].startTime!);
      return;
    }
    if (prevIndex !== -1 && project.lyrics[prevIndex]?.startTime !== null) {
      audioEngine.seek(project.lyrics[prevIndex].startTime!);
      return;
    }
    audioEngine.seek(project.settings.trimStart || 0);
  }, []);

  const triggerTapSync = useCallback(() => {
    const state = useProjectStore.getState();
    const {
      project,
      syncMode,
      activeSyncLineIndex,
      activeSyncWordIndex,
      duration,
      isPlaying,
    } = state;

    if (project.lyrics.length === 0) return;

    if (!isPlaying) {
      void audioEngine.play();
    }

    const tapTime = audioEngine.getCurrentTime();

    if (syncMode === 'line') {
      const safeLineIdx = Math.max(0, Math.min(project.lyrics.length - 1, activeSyncLineIndex));
      const updated = applyLineTapTimestamp(project.lyrics, safeLineIdx, tapTime, duration);
      state.setLyricsWithHistory(updated);

      if (safeLineIdx + 1 < project.lyrics.length) {
        state.setActiveSyncLineIndex(safeLineIdx + 1);
      }
      state.setActiveSyncWordIndex(0);
    } else {
      const safeLineIdx = Math.max(0, Math.min(project.lyrics.length - 1, activeSyncLineIndex));
      const { updatedLines, nextLineIndex, nextWordIndex } = applyWordTapTimestamp(
        project.lyrics,
        safeLineIdx,
        activeSyncWordIndex,
        tapTime,
        duration
      );
      state.setLyricsWithHistory(updatedLines);
      state.setActiveSyncLineIndex(nextLineIndex);
      state.setActiveSyncWordIndex(nextWordIndex);
    }
  }, []);

  return {
    decodeStatus,
    decodeError,
    loadAudioFile,
    play: (fromTime?: number) => audioEngine.play(fromTime),
    pause: () => audioEngine.pause(),
    togglePlay: () => audioEngine.togglePlay(),
    seek: (time: number) => audioEngine.seek(time),
    seekRelative: (delta: number) => {
      const now = audioEngine.getCurrentTime();
      audioEngine.seek(now + delta);
    },
    seekToCurrentLineStart,
    triggerTapSync,
    setVolume: (vol: number, muted?: boolean) => audioEngine.setVolume(vol, muted),
    setPlaybackRate: (rate: 0.5 | 0.75 | 1) => audioEngine.setPlaybackRate(rate),
  };
}

export function useGlobalMediaShortcuts() {
  const { loadAudioFile, triggerTapSync } = useAudioEngine();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isEditingInput) return;

      const store = useProjectStore.getState();

      if (e.code === 'Space') {
        e.preventDefault();
        if (store.isTapSyncActive) {
          triggerTapSync();
        } else {
          void audioEngine.togglePlay();
        }
        return;
      }

      if (e.code === 'Enter') {
        e.preventDefault();
        const total = store.project.lyrics.length;
        if (total === 0) return;
        const delta = e.shiftKey ? -1 : 1;
        const nextIdx = Math.max(0, Math.min(total - 1, store.activeSyncLineIndex + delta));
        store.setActiveSyncLineIndex(nextIdx);
        store.setActiveSyncWordIndex(0);
        return;
      }

      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.shiftKey ? -5 : -1;
        audioEngine.seek(audioEngine.getCurrentTime() + delta);
        return;
      }

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        audioEngine.seek(audioEngine.getCurrentTime() + delta);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          store.redoLyrics();
        } else {
          store.undoLyrics();
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        store.setExportModalOpen(true);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name)) {
          e.preventDefault();
          void loadAudioFile(file);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [loadAudioFile, triggerTapSync]);
}
