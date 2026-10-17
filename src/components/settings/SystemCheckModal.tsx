import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Cpu, HardDrive } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { probeExportPipeline } from '../../features/export-pipeline/capabilities';
import { formatBytes } from '../../utils/time';

export const SystemCheckModal: React.FC = () => {
  const isOpen = useProjectStore((s) => s.isSystemCheckModalOpen);
  const setOpen = useProjectStore((s) => s.setSystemCheckModalOpen);

  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [probedEngine, setProbedEngine] = useState<string>('Đang kiểm tra...');

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;

    if (navigator.storage && navigator.storage.estimate) {
      void navigator.storage.estimate().then((est) => {
        if (mounted && est.usage !== undefined && est.quota !== undefined) {
          setStorageUsage({ usage: est.usage, quota: est.quota });
        }
      });
    }

    void probeExportPipeline('mp4', 1920, 1080, 30, 5_000_000, 192_000).then((res) => {
      if (mounted) {
        setProbedEngine(
          `${res.engine.toUpperCase()} (${res.videoCodec || 'N/A'} / ${res.audioCodec || 'N/A'})`
        );
      }
    });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const checks = [
    {
      name: 'Web Audio API (AudioContext)',
      supported:
        typeof window !== 'undefined' &&
        ('AudioContext' in window || 'webkitAudioContext' in window),
      detail: 'Bắt buộc để giải mã nhạc, tạo sóng âm và đồng hồ chuẩn.',
    },
    {
      name: 'HTML5 Canvas 2D & OffscreenCanvas',
      supported: typeof window !== 'undefined' && 'OffscreenCanvas' in window,
      detail: 'Kết xuất khung hình nền và chữ karaoke chống nhấp nháy.',
    },
    {
      name: 'WebCodecs API (VideoFrame & AudioData)',
      supported:
        typeof window !== 'undefined' && 'VideoFrame' in window && 'AudioData' in window,
      detail: 'Đóng gói khung hình phần cứng tốc độ cao.',
    },
    {
      name: 'WebCodecs VideoEncoder (MP4 H.264 / WebM)',
      supported: typeof window !== 'undefined' && 'VideoEncoder' in window,
      detail: `Pipeline khả dụng: ${probedEngine}`,
    },
    {
      name: 'WebCodecs AudioEncoder (AAC / Opus)',
      supported: typeof window !== 'undefined' && 'AudioEncoder' in window,
      detail: 'Mã hóa âm thanh đồng bộ tuyệt đối với hình ảnh.',
    },
    {
      name: 'IndexedDB Local-First Storage',
      supported: typeof window !== 'undefined' && 'indexedDB' in window,
      detail: 'Lưu tự động bản nháp và Blob âm thanh/video dung lượng lớn.',
    },
    {
      name: 'File System Access API',
      supported: typeof window !== 'undefined' && 'showSaveFilePicker' in window,
      detail: 'Tùy chọn ghi trực tiếp file ra ổ cứng trên trình duyệt Chromium.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="system-check-title"
    >
      <div className="bg-forge-panel border border-forge-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-forge-border pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-400" />
            <h2 id="system-check-title" className="text-base font-bold text-white">
              Kiểm tra tương thích trình duyệt (System Check)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-forge-muted hover:text-white p-1 rounded"
            aria-label="Đóng bảng kiểm tra hệ thống"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {storageUsage && (
          <div className="p-3 rounded-xl bg-forge-surface/80 border border-forge-border flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-forge-text font-medium">
              <HardDrive className="w-4 h-4 text-forge-highlight" />
              <span>Bộ nhớ cục bộ (IndexedDB):</span>
            </div>
            <span className="font-mono text-forge-highlight">
              {formatBytes(storageUsage.usage)} / {formatBytes(storageUsage.quota)}
            </span>
          </div>
        )}

        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {checks.map((item) => (
            <div
              key={item.name}
              className="p-3 rounded-xl bg-forge-surface border border-forge-border flex items-start justify-between gap-3"
            >
              <div>
                <p className="text-xs font-semibold text-white">{item.name}</p>
                <p className="text-[11px] text-forge-muted mt-0.5">{item.detail}</p>
              </div>
              {item.supported ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Hỗ trợ
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Fallback
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 rounded-lg bg-forge-accent hover:bg-forge-accentHover text-xs font-semibold text-white"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};
