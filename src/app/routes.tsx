import React, { useState } from 'react';
import { Music, MonitorPlay, AlignLeft } from 'lucide-react';
import { Header } from '../components/ui/Header';
import { MediaPanel } from '../components/media/MediaPanel';
import { PreviewPanel } from '../components/preview/PreviewPanel';
import { LyricsAndStylePanel } from '../components/lyrics/LyricsAndStylePanel';
import { TimelinePanel } from '../components/timeline/TimelinePanel';
import { ExportModal } from '../components/export/ExportModal';
import { SystemCheckModal } from '../components/settings/SystemCheckModal';
import { ToastContainer } from '../components/ui/ToastContainer';
import { useGlobalMediaShortcuts } from '../hooks/useAudioEngine';
import { useProjectPersistence } from '../hooks/useProjectPersistence';

export const WorkspaceLayout: React.FC = () => {
  useGlobalMediaShortcuts();
  useProjectPersistence();

  const [mobilePane, setMobilePane] = useState<'media' | 'preview' | 'lyrics'>('preview');

  return (
    <div className="h-screen w-screen flex flex-col bg-forge-bg text-forge-text overflow-hidden">
      <Header />

      <div className="flex lg:hidden border-b border-forge-border bg-forge-panel px-2 py-1 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setMobilePane('media')}
          className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 ${
            mobilePane === 'media'
              ? 'bg-forge-accent text-white'
              : 'text-forge-muted hover:text-white'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Media & Dự án</span>
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('preview')}
          className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 ${
            mobilePane === 'preview'
              ? 'bg-forge-accent text-white'
              : 'text-forge-muted hover:text-white'
          }`}
        >
          <MonitorPlay className="w-3.5 h-3.5" />
          <span>Xem trước</span>
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('lyrics')}
          className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 ${
            mobilePane === 'lyrics'
              ? 'bg-forge-accent text-white'
              : 'text-forge-muted hover:text-forge-text'
          }`}
        >
          <AlignLeft className="w-3.5 h-3.5" />
          <span>Lời & Sync</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <div
          className={`${
            mobilePane === 'media' ? 'flex' : 'hidden'
          } lg:flex flex-1 lg:flex-none min-h-0 overflow-hidden`}
        >
          <MediaPanel />
        </div>

        <div
          className={`${
            mobilePane === 'preview' ? 'flex' : 'hidden'
          } lg:flex flex-1 min-h-0 overflow-hidden`}
        >
          <PreviewPanel />
        </div>

        <div
          className={`${
            mobilePane === 'lyrics' ? 'flex' : 'hidden'
          } lg:flex flex-1 lg:flex-none min-h-0 overflow-hidden`}
        >
          <LyricsAndStylePanel />
        </div>
      </div>

      <TimelinePanel />
      <ExportModal />
      <SystemCheckModal />
      <ToastContainer />
    </div>
  );
};
