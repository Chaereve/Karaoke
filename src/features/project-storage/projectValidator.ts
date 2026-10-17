import { z } from 'zod';
import { KaraokeProject } from '../../types/project';
import { createInitialProject } from '../../store/useProjectStore';

const LyricWordSchema = z.object({
  id: z.string(),
  text: z.string(),
  startTime: z.number().nullable(),
  endTime: z.number().nullable(),
});

const LyricLineSchema = z.object({
  id: z.string(),
  text: z.string(),
  startTime: z.number().nullable(),
  endTime: z.number().nullable(),
  words: z.array(LyricWordSchema),
  singer: z.enum(['A', 'B']).optional(),
});

const TextStyleSchema = z.object({
  fontFamily: z.string(),
  fontSize: z.number().min(12).max(200),
  fontWeight: z.number(),
  letterSpacing: z.number().optional(),
  lineHeight: z.number().optional(),
  color: z.string(),
  highlightColor: z.string(),
  secondarySingerColor: z.string().optional(),
  strokeColor: z.string(),
  strokeWidth: z.number().min(0).max(40),
  shadow: z.boolean(),
  glow: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  verticalPosition: z.enum(['top', 'center', 'bottom']),
  animation: z.enum(['none', 'fade', 'slide', 'scale', 'typewriter']),
  safeAreaOverlay: z.boolean().optional(),
  showWatermark: z.boolean().optional(),
  watermarkText: z.string().optional(),
  showIntroTitle: z.boolean().optional(),
  showCountdown: z.boolean().optional(),
});

const BackgroundConfigSchema = z.object({
  type: z.enum(['gradient', 'image', 'video']),
  color1: z.string(),
  color2: z.string(),
  gradientAngle: z.number(),
  animateGradient: z.boolean(),
  particles: z.boolean(),
  blur: z.number(),
  brightness: z.number(),
  vignette: z.boolean(),
  assetUrl: z.string().optional(),
  assetName: z.string().optional(),
});

const ProjectSettingsSchema = z.object({
  title: z.string(),
  artist: z.string().optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5']),
  resolution: z.enum(['720p', '1080p', '4K']),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  templateId: z.string(),
  textStyle: TextStyleSchema,
  background: BackgroundConfigSchema,
  trimStart: z.number().min(0),
  trimEnd: z.number().nullable(),
  musicVolume: z.number().min(0).max(2),
  isMuted: z.boolean().optional(),
});

const ExportSettingsSchema = z.object({
  format: z.enum(['mp4', 'webm']),
  videoBitrate: z.number().positive(),
  audioBitrate: z.number().positive(),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  bitratePreset: z.enum(['low', 'medium', 'high', 'custom']).optional(),
});

export const PortableProjectSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  settings: ProjectSettingsSchema,
  exportSettings: ExportSettingsSchema.optional(),
  lyrics: z.array(LyricLineSchema),
});

export function parseAndValidateProjectJson(rawJson: string): KaraokeProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('File JSON không hợp lệ hoặc bị hỏng cú pháp.');
  }

  const result = PortableProjectSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new Error(
      `Cấu trúc file dự án không hợp lệ tại trường "${firstIssue?.path.join('.') || 'root'}": ${
        firstIssue?.message || 'Sai kiểu dữ liệu'
      }`
    );
  }

  const fallback = createInitialProject(result.data.name);
  const now = Date.now();

  return {
    ...fallback,
    id: result.data.id || fallback.id,
    name: result.data.name,
    createdAt: result.data.createdAt || now,
    updatedAt: now,
    settings: result.data.settings,
    exportSettings: result.data.exportSettings || fallback.exportSettings,
    lyrics: result.data.lyrics,
    audioMetadata: null,
    audioFileRef: null,
    backgroundAssetRef: null,
  };
}
