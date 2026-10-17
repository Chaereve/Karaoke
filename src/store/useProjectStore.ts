import { create } from 'zustand';
import {
  AudioMetadata,
  BackgroundConfig,
  ExportSettings,
  KaraokeProject,
  Language,
  LeftPanelTab,
  LyricLine,
  ProjectSettings,
  RightPanelTab,
  SyncMode,
  TextStyle,
  ToastMessage,
} from '../types/project';
import { KARAOKE_TEMPLATES } from '../features/templates/presets';
import { createId } from '../utils/id';

const DEFAULT_TEMPLATE = KARAOKE_TEMPLATES[0];

const SAMPLE_LYRICS: LyricLine[] = [
  {
    id: 'line_1',
    text: 'Chào mừng bạn đến với KaraokeForge Studio',
    startTime: 0.5,
    endTime: 4.0,
    singer: 'A',
    words: [
      { id: 'w_1', text: 'Chào', startTime: 0.5, endTime: 0.9 },
      { id: 'w_2', text: 'mừng', startTime: 0.9, endTime: 1.3 },
      { id: 'w_3', text: 'bạn', startTime: 1.3, endTime: 1.7 },
      { id: 'w_4', text: 'đến', startTime: 1.7, endTime: 2.1 },
      { id: 'w_5', text: 'với', startTime: 2.1, endTime: 2.5 },
      { id: 'w_6', text: 'KaraokeForge', startTime: 2.5, endTime: 3.4 },
      { id: 'w_7', text: 'Studio', startTime: 3.4, endTime: 4.0 },
    ],
  },
  {
    id: 'line_2',
    text: 'Tải bài hát lên và nhấn phím Space để bắt đầu căn nhịp',
    startTime: 4.2,
    endTime: 8.5,
    singer: 'A',
    words: [
      { id: 'w_8', text: 'Tải', startTime: 4.2, endTime: 4.6 },
      { id: 'w_9', text: 'bài', startTime: 4.6, endTime: 5.0 },
      { id: 'w_10', text: 'hát', startTime: 5.0, endTime: 5.4 },
      { id: 'w_11', text: 'lên', startTime: 5.4, endTime: 5.8 },
      { id: 'w_12', text: 'và', startTime: 5.8, endTime: 6.1 },
      { id: 'w_13', text: 'nhấn', startTime: 6.1, endTime: 6.5 },
      { id: 'w_14', text: 'phím', startTime: 6.5, endTime: 6.9 },
      { id: 'w_15', text: 'Space', startTime: 6.9, endTime: 7.4 },
      { id: 'w_16', text: 'để', startTime: 7.4, endTime: 7.7 },
      { id: 'w_17', text: 'bắt', startTime: 7.7, endTime: 8.0 },
      { id: 'w_18', text: 'đầu', startTime: 8.0, endTime: 8.2 },
      { id: 'w_19', text: 'căn', startTime: 8.2, endTime: 8.35 },
      { id: 'w_20', text: 'nhịp', startTime: 8.35, endTime: 8.5 },
    ],
  },
];

export function createInitialProject(name = 'Dự án Karaoke mới'): KaraokeProject {
  const now = Date.now();
  return {
    id: createId('proj'),
    name,
    createdAt: now,
    updatedAt: now,
    settings: {
      title: name,
      artist: 'KaraokeForge Creator',
      aspectRatio: DEFAULT_TEMPLATE.aspectRatio,
      resolution: '1080p',
      fps: 30,
      templateId: DEFAULT_TEMPLATE.id,
      textStyle: { ...DEFAULT_TEMPLATE.textStyle },
      background: { ...DEFAULT_TEMPLATE.background },
      trimStart: 0,
      trimEnd: null,
      musicVolume: 1,
      isMuted: false,
    },
    exportSettings: {
      format: 'mp4',
      videoBitrate: 5_000_000,
      audioBitrate: 192_000,
      fps: 30,
      bitratePreset: 'medium',
    },
    lyrics: SAMPLE_LYRICS,
    audioMetadata: null,
    audioFileRef: null,
    backgroundAssetRef: null,
  };
}

interface ProjectStoreState {
  project: KaraokeProject;
  recentProjects: Array<{ id: string; name: string; updatedAt: number }>;

  // History for Undo/Redo on lyric & timing operations
  undoStack: LyricLine[][];
  redoStack: LyricLine[][];

  // Realtime Playback State
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: 0.5 | 0.75 | 1;
  loopRegion: { start: number; end: number } | null;
  waveformPeaks: number[];

  // Sync Studio State
  syncMode: SyncMode;
  activeSyncLineIndex: number;
  activeSyncWordIndex: number;
  isTapSyncActive: boolean;

  // UI & Workspace State
  language: Language;
  leftTab: LeftPanelTab;
  rightTab: RightPanelTab;
  timelineZoom: number;
  isExportModalOpen: boolean;
  isSystemCheckModalOpen: boolean;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  toasts: ToastMessage[];

  // Actions
  setLanguage: (lang: Language) => void;
  setLeftTab: (tab: LeftPanelTab) => void;
  setRightTab: (tab: RightPanelTab) => void;
  setTimelineZoom: (zoom: number) => void;
  setExportModalOpen: (open: boolean) => void;
  setSystemCheckModalOpen: (open: boolean) => void;

  // Project Mutations
  setProject: (project: KaraokeProject) => void;
  resetNewProject: (name?: string) => void;
  updateProjectName: (name: string) => void;
  updateSettings: (partial: Partial<ProjectSettings>) => void;
  updateTextStyle: (partial: Partial<TextStyle>) => void;
  updateBackground: (partial: Partial<BackgroundConfig>) => void;
  updateExportSettings: (partial: Partial<ExportSettings>) => void;
  applyTemplate: (templateId: string) => void;

  // Audio & Media Mutations
  setAudioData: (file: File | Blob | null, metadata: AudioMetadata | null, peaks: number[]) => void;
  setBackgroundAsset: (file: File | Blob | null, objectUrl?: string, assetName?: string) => void;

  // Playback Actions
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: 0.5 | 0.75 | 1) => void;
  setLoopRegion: (region: { start: number; end: number } | null) => void;

  // Lyrics & Undo/Redo Actions
  setLyricsWithHistory: (lyrics: LyricLine[]) => void;
  setLyricsSilent: (lyrics: LyricLine[]) => void;
  undoLyrics: () => void;
  redoLyrics: () => void;

  // Sync Studio Actions
  setSyncMode: (mode: SyncMode) => void;
  setActiveSyncLineIndex: (index: number) => void;
  setActiveSyncWordIndex: (index: number) => void;
  setIsTapSyncActive: (active: boolean) => void;

  // Storage & Toast Actions
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void;
  setRecentProjects: (list: Array<{ id: string; name: string; updatedAt: number }>) => void;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  project: createInitialProject(),
  recentProjects: [],
  undoStack: [],
  redoStack: [],

  isPlaying: false,
  currentTime: 0,
  duration: 12,
  playbackRate: 1,
  loopRegion: null,
  waveformPeaks: [],

  syncMode: 'line',
  activeSyncLineIndex: 0,
  activeSyncWordIndex: 0,
  isTapSyncActive: false,

  language: 'vi',
  leftTab: 'media',
  rightTab: 'lyrics',
  timelineZoom: 1,
  isExportModalOpen: false,
  isSystemCheckModalOpen: false,
  saveStatus: 'saved',
  toasts: [],

  setLanguage: (language) => set({ language }),
  setLeftTab: (leftTab) => set({ leftTab }),
  setRightTab: (rightTab) => set({ rightTab }),
  setTimelineZoom: (timelineZoom) => set({ timelineZoom: Math.max(1, Math.min(20, timelineZoom)) }),
  setExportModalOpen: (isExportModalOpen) => set({ isExportModalOpen }),
  setSystemCheckModalOpen: (isSystemCheckModalOpen) => set({ isSystemCheckModalOpen }),

  setProject: (project) =>
    set({
      project,
      undoStack: [],
      redoStack: [],
      currentTime: project.settings.trimStart || 0,
      duration: project.audioMetadata?.duration || 12,
      saveStatus: 'saved',
    }),

  resetNewProject: (name) => {
    const fresh = createInitialProject(name);
    set({
      project: fresh,
      undoStack: [],
      redoStack: [],
      isPlaying: false,
      currentTime: 0,
      duration: 12,
      waveformPeaks: [],
      activeSyncLineIndex: 0,
      activeSyncWordIndex: 0,
      saveStatus: 'saved',
    });
  },

  updateProjectName: (name) =>
    set((state) => ({
      project: {
        ...state.project,
        name,
        settings: { ...state.project.settings, title: name },
        updatedAt: Date.now(),
      },
      saveStatus: 'unsaved',
    })),

  updateSettings: (partial) =>
    set((state) => ({
      project: {
        ...state.project,
        settings: { ...state.project.settings, ...partial },
        updatedAt: Date.now(),
      },
      saveStatus: 'unsaved',
    })),

  updateTextStyle: (partial) =>
    set((state) => ({
      project: {
        ...state.project,
        settings: {
          ...state.project.settings,
          textStyle: { ...state.project.settings.textStyle, ...partial },
        },
        updatedAt: Date.now(),
      },
      saveStatus: 'unsaved',
    })),

  updateBackground: (partial) =>
    set((state) => ({
      project: {
        ...state.project,
        settings: {
          ...state.project.settings,
          background: { ...state.project.settings.background, ...partial },
        },
        updatedAt: Date.now(),
      },
      saveStatus: 'unsaved',
    })),

  updateExportSettings: (partial) =>
    set((state) => ({
      project: {
        ...state.project,
        exportSettings: { ...state.project.exportSettings, ...partial },
        updatedAt: Date.now(),
      },
      saveStatus: 'unsaved',
    })),

  applyTemplate: (templateId) => {
    const found = KARAOKE_TEMPLATES.find((tpl) => tpl.id === templateId);
    if (!found) return;
    set((state) => ({
      project: {
        ...state.project,
        settings: {
          ...state.project.settings,
          templateId: found.id,
          aspectRatio: found.aspectRatio,
          textStyle: { ...found.textStyle },
          background: {
            ...found.background,
            assetUrl: state.project.settings.background.assetUrl,
            assetName: state.project.settings.background.assetName,
          },
        },
        updatedAt: Date.now(),
      },
      saveStatus: 'unsaved',
    }));
  },

  setAudioData: (file, metadata, peaks) =>
    set((state) => ({
      project: {
        ...state.project,
        audioFileRef: file,
        audioMetadata: metadata,
        settings: {
          ...state.project.settings,
          trimStart: 0,
          trimEnd: metadata ? metadata.duration : null,
        },
        updatedAt: Date.now(),
      },
      duration: metadata ? metadata.duration : 12,
      currentTime: 0,
      waveformPeaks: peaks,
      saveStatus: 'unsaved',
    })),

  setBackgroundAsset: (file, objectUrl, assetName) =>
    set((state) => ({
      project: {
        ...state.project,
        backgroundAssetRef: file,
        settings: {
          ...state.project.settings,
          background: {
            ...state.project.settings.background,
            assetUrl: objectUrl,
            assetName,
          },
        },
        updatedAt: Date.now(),
      },
      saveStatus: 'unsaved',
    })),

  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setLoopRegion: (loopRegion) => set({ loopRegion }),

  setLyricsWithHistory: (newLyrics) =>
    set((state) => {
      const snapshot = structuredClone(state.project.lyrics);
      const nextUndo = [...state.undoStack.slice(-49), snapshot];
      return {
        undoStack: nextUndo,
        redoStack: [],
        project: {
          ...state.project,
          lyrics: newLyrics,
          updatedAt: Date.now(),
        },
        saveStatus: 'unsaved',
      };
    }),

  setLyricsSilent: (newLyrics) =>
    set((state) => ({
      project: {
        ...state.project,
        lyrics: newLyrics,
        updatedAt: Date.now(),
      },
      saveStatus: 'unsaved',
    })),

  undoLyrics: () => {
    const { undoStack, redoStack, project } = get();
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const currentSnapshot = structuredClone(project.lyrics);
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, currentSnapshot],
      project: {
        ...project,
        lyrics: previous,
        updatedAt: Date.now(),
      },
      saveStatus: 'unsaved',
    });
  },

  redoLyrics: () => {
    const { undoStack, redoStack, project } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const currentSnapshot = structuredClone(project.lyrics);
    set({
      undoStack: [...undoStack, currentSnapshot],
      redoStack: redoStack.slice(0, -1),
      project: {
        ...project,
        lyrics: next,
        updatedAt: Date.now(),
      },
      saveStatus: 'unsaved',
    });
  },

  setSyncMode: (syncMode) => set({ syncMode }),
  setActiveSyncLineIndex: (activeSyncLineIndex) => set({ activeSyncLineIndex }),
  setActiveSyncWordIndex: (activeSyncWordIndex) => set({ activeSyncWordIndex }),
  setIsTapSyncActive: (isTapSyncActive) => set({ isTapSyncActive }),

  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setRecentProjects: (recentProjects) => set({ recentProjects }),

  addToast: (toast) => {
    const id = createId('toast');
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((item) => item.id !== id),
      }));
    }, 4500);
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((item) => item.id !== id),
    })),
}));
