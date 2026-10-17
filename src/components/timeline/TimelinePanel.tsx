import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  Repeat,
  CornerUpLeft,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { WaveformCanvas } from './WaveformCanvas';
import { formatTimeDisplay } from '../../utils/time';
import { t } from '../../utils/i18n';

export const TimelinePanel: React.FC = () => {
  const language = useProjectStore((s) => s.language);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const currentTime = useProjectStore((s) => s.currentTime);
  const duration = useProjectStore((s) => s.duration);
  const playbackRate = useProjectStore((s) => s.playbackRate);
  const timelineZoom = useProjectStore((s) => s.timelineZoom);
  const setTimelineZoom = useProjectStore((s) => s.setTimelineZoom);
  const musicVolume = useProjectStore((s) => s.project.settings.musicVolume);
  const isMuted = useProjectStore((s) => Boolean(s.project.settings.isMuted));
  const loopRegion = useProjectStore((s) => s.loopRegion);
  const setLoopRegion = useProjectStore((s) => s.setLoopRegion);

  const {
    togglePlay,
    seekRelative,
    seekToCurrentLineStart,
    setVolume,
    setPlaybackRate,
  } = useAudioEngine();

  const handleToggleLoop = () => {
    if (loopRegion) {
      setLoopRegion(null);
    } else {
      const start = Math.max(0, currentTime);
      const end = Math.min(duration, start + 8);
      if (end > start + 0.5) {
        setLoopRegion({ start, end });
      }
    }
  };

  return (
    <section
      className="h-44 bg-forge-panel border-t border-forge-border flex flex-col shrink-0 select-none"
      aria-label={t(language, 'timelineTitle')}
    >
      {/* Transport Controls Bar */}
      <div className="h-11 px-4 border-b border-forge-border flex items-center justify-between gap-3 bg-forge-surface/40">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => seekRelative(-5)}
            className="p-1.5 rounded hover:bg-forge-surface text-forge-muted hover:text-white transition"
            title="Lùi 5 giây (Shift + ←)"
            aria-label="Lùi 5 giây"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => void togglePlay()}
            className="w-8 h-8 rounded-full bg-forge-accent hover:bg-forge-accentHover text-white flex items-center justify-center shadow transition"
            title={isPlaying ? t(language, 'pause') : t(language, 'play')}
            aria-label={isPlaying ? t(language, 'pause') : t(language, 'play')}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => seekRelative(5)}
            className="p-1.5 rounded hover:bg-forge-surface text-forge-muted hover:text-white transition"
            title="Tiến 5 giây (Shift + →)"
            aria-label="Tiến 5 giây"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={seekToCurrentLineStart}
            className="p-1.5 rounded hover:bg-forge-surface text-forge-muted hover:text-white transition"
            title={language === 'vi' ? 'Về đầu câu hiện tại' : 'Seek to start of current line'}
            aria-label="Về đầu câu hiện tại"
          >
            <CornerUpLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleToggleLoop}
            className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 border transition ${
              loopRegion
                ? 'bg-forge-accent/20 border-forge-accent text-forge-highlight'
                : 'bg-forge-bg border-forge-border text-forge-muted hover:text-white'
            }`}
            title={language === 'vi' ? 'Lặp đoạn 8s quanh vị trí hiện tại' : 'Loop 8s around playhead'}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Loop</span>
          </button>

          <div className="ml-2 font-mono text-xs text-forge-text">
            <span className="text-forge-highlight font-semibold">{formatTimeDisplay(currentTime)}</span>
            <span className="text-forge-muted"> / {formatTimeDisplay(duration)}</span>
          </div>
        </div>

        <div className="hidden xl:block text-[11px] text-forge-muted truncate">
          {t(language, 'shortcutsHint')}
        </div>

        {/* Volume, Speed & Zoom Controls */}
        <div className="flex items-center gap-3">
          {/* Volume control */}
          <div className="flex items-center gap-1.5 bg-forge-bg px-2.5 py-1 rounded border border-forge-border">
            <button
              type="button"
              onClick={() => setVolume(musicVolume, !isMuted)}
              className="text-forge-muted hover:text-white"
              aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
            >
              {isMuted || musicVolume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-forge-highlight" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : musicVolume}
              onChange={(e) => setVolume(Number(e.target.value), false)}
              aria-label="Âm lượng nhạc"
              className="w-16 sm:w-20 accent-forge-accent cursor-pointer h-1"
            />
            <span className="text-[10px] font-mono w-8 text-right text-forge-muted">
              {isMuted ? '0%' : `${Math.round(musicVolume * 100)}%`}
            </span>
          </div>

          {/* Playback Speed */}
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value) as 0.5 | 0.75 | 1)}
            aria-label="Tốc độ phát"
            className="bg-forge-bg text-xs font-mono text-forge-text px-2 py-1 rounded border border-forge-border focus:outline-none"
          >
            <option value={0.5}>0.5x</option>
            <option value={0.75}>0.75x</option>
            <option value={1}>1.0x</option>
          </select>

          {/* Waveform Zoom */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTimelineZoom(timelineZoom - 1)}
              className="p-1 rounded bg-forge-surface hover:bg-slate-800 border border-forge-border"
              aria-label="Thu nhỏ timeline"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono w-8 text-center">{timelineZoom}x</span>
            <button
              type="button"
              onClick={() => setTimelineZoom(timelineZoom + 1)}
              className="p-1 rounded bg-forge-surface hover:bg-slate-800 border border-forge-border"
              aria-label="Phóng to timeline"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Real High-DPI Waveform Canvas */}
      <WaveformCanvas />
    </section>
  );
};
