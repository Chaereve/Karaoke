import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';

export const ToastContainer: React.FC = () => {
  const toasts = useProjectStore((s) => s.toasts);
  const removeToast = useProjectStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      role="region"
      aria-label="Thông báo hệ thống"
    >
      {toasts.map((toast) => {
        const iconMap = {
          success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
          warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
          error: <XCircle className="w-5 h-5 text-rose-400 shrink-0" />,
          info: <Info className="w-5 h-5 text-sky-400 shrink-0" />,
        };

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg bg-forge-surface border border-forge-border shadow-xl text-sm text-forge-text transition-all"
          >
            {iconMap[toast.type]}
            <div className="flex-1 min-w-0">
              <p className="font-semibold leading-tight">{toast.title}</p>
              {toast.description && (
                <p className="text-xs text-forge-muted mt-1 leading-relaxed">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-forge-muted hover:text-white p-1 rounded focus:outline-none focus:ring-2 focus:ring-forge-accent"
              aria-label="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
