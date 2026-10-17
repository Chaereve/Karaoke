import React from 'react';
import {
  Mic2,
  Save,
  Download,
  Cpu,
  Globe,
  FilePlus2,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useProjectPersistence } from '../../hooks/useProjectPersistence';
import { t } from '../../utils/i18n';

export const Header: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const language = useProjectStore((s) => s.language);
  const saveStatus = useProjectStore((s) => s.saveStatus);
  const setLanguage = useProjectStore((s) => s.setLanguage);
  const updateProjectName = useProjectStore((s) => s.updateProjectName);
  const setExportModalOpen = useProjectStore((s) => s.setExportModalOpen);
  const setSystemCheckModalOpen = useProjectStore((s) => s.setSystemCheckModalOpen);

  const { saveNow, createNewAndSave } = useProjectPersistence();

  return (
    <header className="h-14 bg-forge-panel border-b border-forge-border px-4 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 text-forge-accent font-bold text-lg tracking-tight shrink-0">
          <div className="w-8 h-8 rounded-lg bg-forge-accent/15 border border-forge-accent/40 flex items-center justify-center">
            <Mic2 className="w-4 h-4 text-forge-highlight" />
          </div>
          <span className="hidden sm:inline bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            {t(language, 'appName')}
          </span>
        </div>

        <span className="text-forge-border hidden sm:inline">/</span>

        <input
          type="text"
          value={project.name}
          onChange={(e) => updateProjectName(e.target.value)}
          aria-label="Tên dự án"
          className="bg-forge-surface/70 hover:bg-forge-surface focus:bg-forge-surface text-sm font-medium text-forge-text px-2.5 py-1 rounded border border-transparent focus:border-forge-accent focus:outline-none min-w-[140px] max-w-[240px] truncate"
        />

        <div className="hidden md:flex items-center gap-1.5 text-xs text-forge-muted" aria-live="polite">
          {saveStatus === 'saved' ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t(language, 'saved')}</span>
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>{t(language, 'saving')}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void createNewAndSave()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-forge-surface hover:bg-slate-800 text-xs font-medium text-forge-text border border-forge-border transition focus:outline-none focus:ring-2 focus:ring-forge-accent"
          title={t(language, 'newProject')}
          aria-label={t(language, 'newProject')}
        >
          <FilePlus2 className="w-3.5 h-3.5 text-forge-muted" />
          <span className="hidden lg:inline">{t(language, 'newProject')}</span>
        </button>

        <button
          type="button"
          onClick={() => void saveNow(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-forge-surface hover:bg-slate-800 text-xs font-medium text-forge-text border border-forge-border transition focus:outline-none focus:ring-2 focus:ring-forge-accent"
          title="Ctrl/Cmd + S"
          aria-label={t(language, 'saveNow')}
        >
          <Save className="w-3.5 h-3.5 text-forge-highlight" />
          <span className="hidden lg:inline">{t(language, 'saveNow')}</span>
        </button>

        <button
          type="button"
          onClick={() => setSystemCheckModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-forge-surface hover:bg-slate-800 text-xs font-medium text-forge-text border border-forge-border transition focus:outline-none focus:ring-2 focus:ring-forge-accent"
          title={t(language, 'systemCheck')}
          aria-label={t(language, 'systemCheck')}
        >
          <Cpu className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden md:inline">{t(language, 'systemCheck')}</span>
        </button>

        <button
          type="button"
          onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-forge-surface hover:bg-slate-800 text-xs font-semibold text-forge-text border border-forge-border transition uppercase focus:outline-none focus:ring-2 focus:ring-forge-accent"
          aria-label="Chuyển đổi ngôn ngữ VI/EN"
        >
          <Globe className="w-3.5 h-3.5 text-forge-muted" />
          <span>{language}</span>
        </button>

        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-forge-accent hover:bg-forge-accentHover text-xs font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-forge-highlight"
          aria-label={t(language, 'exportVideo')}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t(language, 'exportVideo')}</span>
        </button>
      </div>
    </header>
  );
};
