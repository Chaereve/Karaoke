export type ExportEngineKind = 'webcodecs-mp4' | 'webcodecs-webm' | 'mediarecorder-webm' | 'unsupported';

export interface ProbedCodecConfig {
  engine: ExportEngineKind;
  videoCodec: string;
  audioCodec: string | null;
  container: 'mp4' | 'webm';
  fallbackReasonVi?: string;
  fallbackReasonEn?: string;
}

const H264_CANDIDATES = [
  'avc1.640028',
  'avc1.4d002a',
  'avc1.42001f',
  'avc1.42E01E',
];

const WEBM_VIDEO_CANDIDATES = [
  'vp09.00.10.08',
  'vp8',
];

export async function checkResolutionSupported(
  width: number,
  height: number,
  fps = 30
): Promise<boolean> {
  if (typeof window === 'undefined' || !('VideoEncoder' in window)) {
    return Math.max(width, height) <= 1920;
  }

  for (const codec of [...H264_CANDIDATES, ...WEBM_VIDEO_CANDIDATES]) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        framerate: fps,
        bitrate: 8_000_000,
      });
      if (support.supported) {
        return true;
      }
    } catch {
      // Continue
    }
  }
  return false;
}

export async function probeExportPipeline(
  preferredFormat: 'mp4' | 'webm',
  width: number,
  height: number,
  fps: number,
  videoBitrate: number,
  audioBitrate: number,
  sampleRate = 48000,
  numberOfChannels = 2
): Promise<ProbedCodecConfig> {
  const hasWebCodecs =
    typeof window !== 'undefined' &&
    'VideoEncoder' in window &&
    'VideoFrame' in window &&
    'AudioEncoder' in window &&
    'AudioData' in window;

  if (hasWebCodecs && preferredFormat === 'mp4') {
    let supportedH264: string | null = null;
    for (const codec of H264_CANDIDATES) {
      try {
        const res = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          framerate: fps,
          bitrate: videoBitrate,
          avc: { format: 'avc' },
        });
        if (res.supported) {
          supportedH264 = codec;
          break;
        }
      } catch {
        // Try next
      }
    }

    let supportedAac: string | null = null;
    try {
      const audioRes = await AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        sampleRate,
        numberOfChannels,
        bitrate: audioBitrate,
      });
      if (audioRes.supported) {
        supportedAac = 'mp4a.40.2';
      }
    } catch {
      supportedAac = null;
    }

    if (supportedH264) {
      return {
        engine: 'webcodecs-mp4',
        videoCodec: supportedH264,
        audioCodec: supportedAac,
        container: 'mp4',
      };
    }
  }

  if (hasWebCodecs) {
    let supportedVp: string | null = null;
    for (const codec of WEBM_VIDEO_CANDIDATES) {
      try {
        const res = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          framerate: fps,
          bitrate: videoBitrate,
        });
        if (res.supported) {
          supportedVp = codec;
          break;
        }
      } catch {
        // Try next
      }
    }

    let supportedOpus: string | null = null;
    try {
      const audioRes = await AudioEncoder.isConfigSupported({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels,
        bitrate: audioBitrate,
      });
      if (audioRes.supported) {
        supportedOpus = 'opus';
      }
    } catch {
      supportedOpus = null;
    }

    if (supportedVp) {
      return {
        engine: 'webcodecs-webm',
        videoCodec: supportedVp,
        audioCodec: supportedOpus,
        container: 'webm',
        fallbackReasonVi:
          preferredFormat === 'mp4'
            ? 'Trình duyệt không hỗ trợ bộ mã hóa H.264 MP4 cho cấu hình này. Đã tự động chuyển sang WebCodecs WebM.'
            : undefined,
        fallbackReasonEn:
          preferredFormat === 'mp4'
            ? 'Browser H.264 MP4 encoder is unavailable for this resolution. Automatically switched to WebCodecs WebM.'
            : undefined,
      };
    }
  }

  if (typeof window !== 'undefined' && 'MediaRecorder' in window) {
    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const supportedMime =
      mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    return {
      engine: 'mediarecorder-webm',
      videoCodec: supportedMime,
      audioCodec: 'opus',
      container: 'webm',
      fallbackReasonVi:
        'Trình duyệt không hỗ trợ WebCodecs MP4. Đã tự động chuyển sang chế độ xuất WebM qua MediaRecorder.',
      fallbackReasonEn:
        'WebCodecs MP4 is not supported in this browser. Automatically switched to MediaRecorder WebM fallback.',
    };
  }

  return {
    engine: 'unsupported',
    videoCodec: '',
    audioCodec: null,
    container: 'webm',
    fallbackReasonVi: 'Trình duyệt của bạn không hỗ trợ cả WebCodecs lẫn MediaRecorder.',
    fallbackReasonEn: 'Neither WebCodecs nor MediaRecorder is supported by your browser.',
  };
}
