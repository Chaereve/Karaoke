import { AspectRatio, ResolutionPreset } from '../types/project';

export const AVAILABLE_FONTS = [
  'Be Vietnam Pro',
  'Inter',
  'Montserrat',
  'Playfair Display',
  'JetBrains Mono',
  'Arial',
];

export const BITRATE_PRESETS = {
  low: { videoBitrate: 2_500_000, audioBitrate: 128_000, labelVi: 'Thấp (2.5 Mbps)', labelEn: 'Low (2.5 Mbps)' },
  medium: { videoBitrate: 5_000_000, audioBitrate: 192_000, labelVi: 'Chuẩn (5 Mbps)', labelEn: 'Medium (5 Mbps)' },
  high: { videoBitrate: 8_000_000, audioBitrate: 256_000, labelVi: 'Cao (8 Mbps)', labelEn: 'High (8 Mbps)' },
};

export function getCanvasDimensions(
  aspectRatio: AspectRatio,
  resolution: ResolutionPreset
): { width: number; height: number } {
  const baseShortEdge = resolution === '720p' ? 720 : resolution === '4K' ? 2160 : 1080;

  switch (aspectRatio) {
    case '16:9': {
      const height = baseShortEdge;
      const width = Math.round((height * 16) / 9 / 2) * 2;
      return { width, height };
    }
    case '9:16': {
      const width = baseShortEdge;
      const height = Math.round((width * 16) / 9 / 2) * 2;
      return { width, height };
    }
    case '1:1': {
      return { width: baseShortEdge, height: baseShortEdge };
    }
    case '4:5': {
      const width = baseShortEdge;
      const height = Math.round((width * 5) / 4 / 2) * 2;
      return { width, height };
    }
  }
}
