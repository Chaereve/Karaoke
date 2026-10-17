import React, { useCallback, useEffect, useRef } from 'react';
import { MonitorPlay, Camera, Maximize2 } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { audioEngine } from '../../features/audio-engine/audioEngine';
import { renderKaraokeFrame } from '../../features/renderer/karaokeRenderer';
import { backgroundAssetCache } from '../../features/renderer/backgroundAssetCache';
import { getCanvasDimensions } from '../../utils/constants';
import { t } from '../../utils/i18n';
import { formatTimeDisplay } from '../../utils/time';

export const PreviewPanel: React.FC = () => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const language = useProjectStore((s) => s.language);
  const project = useProjectStore((s) => s.project);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const currentTime = useProjectStore((s) => s.currentTime);
  const addToast = useProjectStore((s) => s.addToast);

  const dims = getCanvasDimensions(project.settings.aspectRatio, project.settings.resolution);

  const drawSingleFrame = useCallback(
    (timeToDraw: number, playingState: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (canvas.width !== dims.width || canvas.height !== dims.height) {
        canvas.width = dims.width;
        canvas.height = dims.height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      renderKaraokeFrame(ctx, {
        project,
        songTime: timeToDraw,
        width: dims.width,
        height: dims.height,
        isPlaying: playingState,
        isExporting: false,
      });
    },
    [project, dims.width, dims.height]
  );

  useEffect(() => {
    backgroundAssetCache.setOnAssetLoaded(() => {
      const now = audioEngine.getCurrentTime();
      drawSingleFrame(now, useProjectStore.getState().isPlaying);
    });
    return () => {
      backgroundAssetCache.setOnAssetLoaded(null);
    };
  }, [drawSingleFrame]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      drawSingleFrame(currentTime, false);
      return;
    }

    const renderLoop = () => {
      const masterSongTime = audioEngine.getCurrentTime();
      drawSingleFrame(masterSongTime, true);
      rafRef.current = requestAnimationFrame(renderLoop);
    };

    rafRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, currentTime, drawSingleFrame]);

  const handleSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        (project.name || 'karaoke-frame') + '-' + Math.round(currentTime * 1000) + 'ms.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addToast({
        type: 'success',
        title: language === 'vi' ? 'Đã chụp khung hình PNG' : 'Saved frame snapshot (PNG)',
      });
    }, 'image/png');
  };

  const handleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  };

  return (
    <main className="flex-1 bg-forge-bg flex flex-col min-w-0 overflow-hidden">
      <div className="h-9 px-4 border-b border-forge-border flex items-center justify-between text-xs text-forge-muted bg-forge-panel/60 shrink-0">
        <div className="flex items-center gap-2">
          <MonitorPlay className="w-3.5 h-3.5 text-forge-highlight" />
          <span className="font-medium text-forge-text">{t(language, 'previewTitle')}</span>
          <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-forge-surface border border-forge-border text-[10px] font-mono text-forge-muted">
            {project.settings.templateId}
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span>
            {project.settings.aspectRatio} • {dims.width}×{dims.height}
          </span>
          <span>{project.settings.fps} FPS</span>
          <span className="text-forge-highlight font-semibold">
            {formatTimeDisplay(currentTime)}
          </span>

          <div className="flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={handleSnapshot}
              className="p-1 rounded hover:bg-forge-surface text-forge-muted hover:text-white transition"
              title={language === 'vi' ? 'Chụp ảnh khung hình (PNG)' : 'Capture PNG Snapshot'}
              aria-label="Chụp ảnh khung hình"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFullscreen}
              className="p-1 rounded hover:bg-forge-surface text-forge-muted hover:text-white transition"
              title={language === 'vi' ? 'Toàn màn hình' : 'Toggle Fullscreen'}
              aria-label="Toàn màn hình"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={stageRef}
        className="flex-1 flex items-center justify-center p-4 sm:p-6 overflow-hidden relative bg-[#06080c]"
      >
        <div
          className="relative flex items-center justify-center max-w-full max-h-full shadow-2xl rounded-xl overflow-hidden border border-forge-border bg-black"
          style={{
            aspectRatio: dims.width + ' / ' + dims.height,
            height: dims.height >= dims.width ? '100%' : 'auto',
            width: dims.width > dims.height ? '100%' : 'auto',
          }}
        >
          <canvas
            ref={canvasRef}
            width={dims.width}
            height={dims.height}
            onClick={() => void audioEngine.togglePlay()}
            className="w-full h-full object-contain block cursor-pointer"
          />
        </div>
      </div>
    </main>
  );
};
