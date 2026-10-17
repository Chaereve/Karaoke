import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Film,
  Download,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Ban,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { BITRATE_PRESETS, getCanvasDimensions } from '../../utils/constants';
import { formatBytes, formatTimeDisplay } from '../../utils/time';
import { checkResolutionSupported } from '../../features/export-pipeline/capabilities';
import {
  ExportCancelledError,
  exportKaraokeVideo,
  ExportProgressInfo,
  ExportResult,
} from '../../features/export-pipeline/exportPipeline';
import { AspectRatio, FpsPreset, ResolutionPreset, TaskStatus } from '../../types/project';

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const ExportModal: React.FC = () => {
  const isOpen = useProjectStore((s) => s.isExportModalOpen);
  const setOpen = useProjectStore((s) => s.setExportModalOpen);
  const project = useProjectStore((s) => s.project);
  const duration = useProjectStore((s) => s.duration);
  const language = useProjectStore((s) => s.language);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const updateExportSettings = useProjectStore((s) => s.updateExportSettings);
  const addToast = useProjectStore((s) => s.addToast);

  const [status, setStatus] = useState<TaskStatus>('idle');
  const [progress, setProgress] = useState<ExportProgressInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ExportResult | null>(null);
  const [is4KSupported, setIs4KSupported] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void checkResolutionSupported(3840, 2160, project.exportSettings.fps).then((ok) => {
      if (active) setIs4KSupported(ok);
    });
    return () => {
      active = false;
    };
  }, [isOpen, project.exportSettings.fps]);

  if (!isOpen) return null;

  const dims = getCanvasDimensions(project.settings.aspectRatio, project.settings.resolution);
  const trimStart = project.settings.trimStart || 0;
  const trimEnd =
    project.settings.trimEnd !== null && project.settings.trimEnd > trimStart
      ? project.settings.trimEnd
      : duration;
  const exportDuration = Math.max(0.5, trimEnd - trimStart);
  const totalFrames = Math.ceil(exportDuration * project.exportSettings.fps);
  const isEncoding = status === 'loading' || status === 'processing';

  const handleBitratePresetChange = (preset: 'low' | 'medium' | 'high' | 'custom') => {
    if (preset === 'custom') {
      updateExportSettings({ bitratePreset: 'custom' });
      return;
    }
    const config = BITRATE_PRESETS[preset];
    updateExportSettings({
      bitratePreset: preset,
      videoBitrate: config.videoBitrate,
      audioBitrate: config.audioBitrate,
    });
  };

  const handleStartExport = async () => {
    setStatus('processing');
    setErrorMsg(null);
    setLastResult(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await exportKaraokeVideo(
        project,
        language,
        (info) => {
          setProgress(info);
        },
        controller.signal
      );

      setLastResult(result);
      setStatus('success');
      triggerBlobDownload(result.blob, result.filename);

      addToast({
        type: 'success',
        title:
          language === 'vi'
            ? 'Xuất video ' + result.container.toUpperCase() + ' thành công!'
            : 'Exported ' + result.container.toUpperCase() + ' video successfully!',
        description: result.filename + ' (' + formatBytes(result.blob.size) + ')',
      });
    } catch (err) {
      if (err instanceof ExportCancelledError) {
        setStatus('cancelled');
        addToast({
          type: 'warning',
          title: language === 'vi' ? 'Đã hủy xuất video' : 'Video export cancelled',
          description:
            language === 'vi'
              ? 'Bộ mã hóa đã dừng và giải phóng bộ nhớ an toàn.'
              : 'Encoders stopped and memory released safely.',
        });
        return;
      }

      const msg =
        err instanceof Error
          ? err.message
          : language === 'vi'
          ? 'Đã xảy ra lỗi trong quá trình kết xuất video.'
          : 'An error occurred during video export.';

      setErrorMsg(msg);
      setStatus('error');
      addToast({
        type: 'error',
        title: language === 'vi' ? 'Xuất video thất bại' : 'Video export failed',
        description: msg,
      });
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleCloseModal = () => {
    if (isEncoding) {
      handleCancelExport();
    }
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="bg-forge-panel border border-forge-border rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-forge-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-forge-accent/15 border border-forge-accent/40 flex items-center justify-center">
              <Film className="w-5 h-5 text-forge-highlight" />
            </div>
            <div>
              <h2 id="export-modal-title" className="text-base font-bold text-white">
                {language === 'vi' ? 'Xuất Video Karaoke' : 'Export Karaoke Video'}
              </h2>
              <p className="text-[11px] text-forge-muted">
                WebCodecs Hardware H.264/AAC MP4 • WebM Fallback • Local-First
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            className="text-forge-muted hover:text-white p-1.5 rounded-lg hover:bg-forge-surface"
            aria-label="Đóng hộp thoại xuất video"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-forge-surface/70 border border-forge-border text-xs">
          <div>
            <span className="text-[11px] text-forge-muted block">Kích thước khung</span>
            <strong className="font-mono text-white">
              {dims.width}×{dims.height} ({project.settings.aspectRatio})
            </strong>
          </div>
          <div>
            <span className="text-[11px] text-forge-muted block">Thời lượng xuất</span>
            <strong className="font-mono text-forge-highlight">
              {formatTimeDisplay(exportDuration, false)} ({totalFrames} frames)
            </strong>
          </div>
          <div>
            <span className="text-[11px] text-forge-muted block">Âm thanh</span>
            <strong className="font-mono text-white truncate block">
              {project.audioMetadata ? project.audioMetadata.fileName : 'Im lặng (Chưa tải nhạc)'}
            </strong>
          </div>
        </div>

        <div className={'space-y-4 text-xs ' + (isEncoding ? 'opacity-50 pointer-events-none' : '')}>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-forge-muted font-medium">Định dạng Container</span>
              <select
                value={project.exportSettings.format}
                onChange={(e) =>
                  updateExportSettings({ format: e.target.value as 'mp4' | 'webm' })
                }
                className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-white font-medium"
              >
                <option value="mp4">MP4 (H.264 + AAC) — Khuyên dùng</option>
                <option value="webm">WebM (VP9 + Opus)</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-forge-muted font-medium">Tốc độ khung hình (FPS)</span>
              <select
                value={project.exportSettings.fps}
                onChange={(e) => {
                  const fps = Number(e.target.value) as FpsPreset;
                  updateExportSettings({ fps });
                  updateSettings({ fps });
                }}
                className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-white font-mono"
              >
                <option value={24}>24 FPS (Cinematic)</option>
                <option value={30}>30 FPS (Chuẩn mạng xã hội)</option>
                <option value={60}>60 FPS (Siêu mượt)</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-forge-muted font-medium">Tỉ lệ khung hình</span>
              <select
                value={project.settings.aspectRatio}
                onChange={(e) =>
                  updateSettings({ aspectRatio: e.target.value as AspectRatio })
                }
                className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-white font-mono"
              >
                <option value="16:9">16:9 (YouTube / TV Ngang)</option>
                <option value="9:16">9:16 (TikTok / Reels / Shorts)</option>
                <option value="1:1">1:1 (Vuông Instagram)</option>
                <option value="4:5">4:5 (Chân dung Feed)</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-forge-muted font-medium">Độ phân giải</span>
              <select
                value={project.settings.resolution}
                onChange={(e) =>
                  updateSettings({ resolution: e.target.value as ResolutionPreset })
                }
                className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-white font-mono"
              >
                <option value="720p">720p HD (Nhanh & Nhẹ)</option>
                <option value="1080p">1080p Full HD (Chuẩn)</option>
                <option value="4K" disabled={!is4KSupported}>
                  4K Ultra HD {!is4KSupported ? '(Thiết bị không hỗ trợ)' : ''}
                </option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-forge-muted font-medium block">Chất lượng Bitrate</span>
            <div className="grid grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'custom'] as const).map((presetKey) => {
                const isSelected = (project.exportSettings.bitratePreset || 'medium') === presetKey;
                const labels = {
                  low: 'Thấp (2.5M)',
                  medium: 'Chuẩn (5M)',
                  high: 'Cao (8M)',
                  custom: 'Tùy chỉnh',
                };
                return (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => handleBitratePresetChange(presetKey)}
                    className={
                      'py-2 px-2.5 rounded-lg border text-xs font-semibold transition ' +
                      (isSelected
                        ? 'bg-forge-accent/20 border-forge-accent text-white'
                        : 'bg-forge-surface border-forge-border text-forge-muted hover:text-white')
                    }
                  >
                    {labels[presetKey]}
                  </button>
                );
              })}
            </div>

            {project.exportSettings.bitratePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Video Bitrate (kbps)</span>
                  <input
                    type="number"
                    min={500}
                    max={35000}
                    step={500}
                    value={Math.round(project.exportSettings.videoBitrate / 1000)}
                    onChange={(e) =>
                      updateExportSettings({
                        videoBitrate: Math.max(500_000, Number(e.target.value) * 1000),
                      })
                    }
                    className="w-full bg-forge-surface border border-forge-border rounded px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Audio Bitrate (kbps)</span>
                  <input
                    type="number"
                    min={64}
                    max={320}
                    step={32}
                    value={Math.round(project.exportSettings.audioBitrate / 1000)}
                    onChange={(e) =>
                      updateExportSettings({
                        audioBitrate: Math.max(64_000, Number(e.target.value) * 1000),
                      })
                    }
                    className="w-full bg-forge-surface border border-forge-border rounded px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {progress?.fallbackNotice && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div>{progress.fallbackNotice}</div>
          </div>
        )}

        {(isEncoding || status === 'success' || status === 'cancelled') && progress && (
          <div className="p-4 rounded-xl bg-forge-surface border border-forge-border space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-semibold text-white">
                {isEncoding && <Loader2 className="w-4 h-4 text-forge-highlight animate-spin" />}
                {status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                <span>
                  {progress.phase === 'probing' && 'Đang kiểm tra bộ mã hóa phần cứng...'}
                  {progress.phase === 'encoding-video' && 'Đang kết xuất & mã hóa khung hình...'}
                  {progress.phase === 'encoding-audio' && 'Đang mã hóa và đồng bộ âm thanh...'}
                  {progress.phase === 'muxing' && 'Đang đóng gói container MP4/WebM...'}
                  {progress.phase === 'completed' && 'Hoàn tất xuất video!'}
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-forge-highlight">
                {progress.percent}%
              </span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-forge-bg overflow-hidden border border-forge-border">
              <div
                className="h-full bg-gradient-to-r from-forge-accent to-forge-highlight transition-all duration-150"
                style={{ width: progress.percent + '%' }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-forge-muted">
              <span>
                Frame: {progress.encodedFrames} / {progress.totalFrames}
              </span>
              <span>Engine: {progress.activeEngine}</span>
              <span>
                ETA: {progress.etaSeconds !== null ? progress.etaSeconds + 's' : '--'}
              </span>
            </div>
          </div>
        )}

        {status === 'error' && errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1">
              <p className="font-semibold text-rose-200">Xuất video không thành công</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {status === 'success' && lastResult && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="font-semibold text-emerald-300 truncate">{lastResult.filename}</p>
              <p className="text-[11px] text-forge-muted font-mono mt-0.5">
                Dung lượng: {formatBytes(lastResult.blob.size)} • Định dạng:{' '}
                {lastResult.container.toUpperCase()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => triggerBlobDownload(lastResult.blob, lastResult.filename)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1.5 shrink-0 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải lại file</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-forge-border">
          <div className="flex items-center gap-1.5 text-[11px] text-forge-muted">
            <Sparkles className="w-3.5 h-3.5 text-forge-highlight" />
            <span>Không chèn watermark bắt buộc • Xử lý 100% trên trình duyệt</span>
          </div>

          <div className="flex items-center gap-2">
            {isEncoding ? (
              <button
                type="button"
                onClick={handleCancelExport}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white flex items-center gap-1.5 shadow transition"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Hủy xuất (Cancel)</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl bg-forge-surface hover:bg-slate-800 text-xs font-medium text-forge-text border border-forge-border transition"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => void handleStartExport()}
                  className="px-5 py-2 rounded-xl bg-forge-accent hover:bg-forge-accentHover text-xs font-bold text-white flex items-center gap-1.5 shadow-lg transition"
                >
                  {status === 'error' || status === 'cancelled' ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Thử lại (Retry)</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Bắt đầu xuất Video</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
