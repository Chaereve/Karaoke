export type LyricWord = {
  id: string;
  text: string;
  startTime: number | null;
  endTime: number | null;
};

export type LyricLine = {
  id: string;
  text: string;
  startTime: number | null;
  endTime: number | null;
  words: LyricWord[];
  singer?: 'A' | 'B';
};

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing?: number;
  lineHeight?: number;
  color: string;
  highlightColor: string;
  secondarySingerColor?: string;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  glow: boolean;
  align: 'left' | 'center' | 'right';
  verticalPosition: 'top' | 'center' | 'bottom';
  animation: 'none' | 'fade' | 'slide' | 'scale' | 'typewriter';
  safeAreaOverlay?: boolean;
  showWatermark?: boolean;
  watermarkText?: string;
  showIntroTitle?: boolean;
  showCountdown?: boolean;
};

export type BackgroundConfig = {
  type: 'gradient' | 'image' | 'video';
  color1: string;
  color2: string;
  gradientAngle: number;
  animateGradient: boolean;
  particles: boolean;
  blur: number;
  brightness: number;
  vignette: boolean;
  assetUrl?: string;
  assetName?: string;
};

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';
export type ResolutionPreset = '720p' | '1080p' | '4K';
export type FpsPreset = 24 | 30 | 60;

export type ProjectSettings = {
  title: string;
  artist?: string;
  aspectRatio: AspectRatio;
  resolution: ResolutionPreset;
  fps: FpsPreset;
  templateId: string;
  textStyle: TextStyle;
  background: BackgroundConfig;
  trimStart: number;
  trimEnd: number | null;
  musicVolume: number;
  isMuted?: boolean;
};

export type ExportSettings = {
  format: 'mp4' | 'webm';
  videoBitrate: number;
  audioBitrate: number;
  fps: FpsPreset;
  bitratePreset?: 'low' | 'medium' | 'high' | 'custom';
};

export type AudioMetadata = {
  fileName: string;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  fileSize: number;
  mimeType: string;
};

export type KaraokeProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  exportSettings: ExportSettings;
  lyrics: LyricLine[];
  audioMetadata?: AudioMetadata | null;
  audioFileRef: Blob | File | null;
  backgroundAssetRef?: Blob | File | null;
};

export type KaraokeTemplate = {
  id: string;
  nameVi: string;
  nameEn: string;
  descriptionVi: string;
  descriptionEn: string;
  aspectRatio: AspectRatio;
  textStyle: TextStyle;
  background: BackgroundConfig;
};

export type SyncMode = 'line' | 'word';
export type RightPanelTab = 'lyrics' | 'sync' | 'style' | 'templates';
export type LeftPanelTab = 'media' | 'background' | 'projects';
export type Language = 'vi' | 'en';

export type TaskStatus = 'idle' | 'loading' | 'processing' | 'success' | 'error' | 'cancelled';

export type ToastMessage = {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
};

export type TimingValidationIssue = {
  lineId: string;
  lineIndex: number;
  type: 'negative' | 'out_of_order' | 'overlap' | 'exceeds_duration' | 'missing_timestamp';
  messageVi: string;
  messageEn: string;
};
