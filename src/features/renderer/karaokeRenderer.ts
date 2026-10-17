import {
  BackgroundConfig,
  KaraokeProject,
  LyricLine,
  LyricWord,
  TextStyle,
} from '../../types/project';
import {
  computeWordProgress,
  findActiveLineIndex,
  getLineWordsWithInterpolatedTiming,
} from '../timing-engine/timingEngine';
import { backgroundAssetCache } from './backgroundAssetCache';

export type RenderContext2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export interface RenderFrameOptions {
  project: KaraokeProject;
  songTime: number;
  width: number;
  height: number;
  isPlaying?: boolean;
  isExporting?: boolean;
  explicitVideoElement?: HTMLVideoElement | null;
}

interface PositionedWord {
  word: LyricWord;
  x: number;
  y: number;
  width: number;
  charIndexStart: number;
}

interface WrappedLineLayout {
  words: PositionedWord[];
  totalChars: number;
  blockHeight: number;
}

let offscreenBackbuffer: OffscreenCanvas | null = null;

function getBackbuffer(
  width: number,
  height: number
): { surface: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } | null {
  if (typeof OffscreenCanvas === 'undefined') {
    return null;
  }
  try {
    if (!offscreenBackbuffer) {
      offscreenBackbuffer = new OffscreenCanvas(width, height);
    }
    if (offscreenBackbuffer.width !== width || offscreenBackbuffer.height !== height) {
      offscreenBackbuffer.width = width;
      offscreenBackbuffer.height = height;
    }
    const ctx = offscreenBackbuffer.getContext('2d');
    if (!ctx) return null;
    return { surface: offscreenBackbuffer, ctx };
  } catch {
    return null;
  }
}

function drawMediaCover(
  ctx: RenderContext2D,
  media: HTMLImageElement | HTMLVideoElement,
  mediaWidth: number,
  mediaHeight: number,
  targetWidth: number,
  targetHeight: number
): void {
  if (mediaWidth <= 0 || mediaHeight <= 0) return;

  const scale = Math.max(targetWidth / mediaWidth, targetHeight / mediaHeight);
  const scaledW = mediaWidth * scale;
  const scaledH = mediaHeight * scale;
  const offsetX = (targetWidth - scaledW) / 2;
  const offsetY = (targetHeight - scaledH) / 2;

  ctx.drawImage(media, offsetX, offsetY, scaledW, scaledH);
}

function renderBackgroundLayer(
  ctx: RenderContext2D,
  bg: BackgroundConfig,
  width: number,
  height: number,
  songTime: number,
  isPlaying: boolean,
  explicitVideoElement?: HTMLVideoElement | null
): void {
  ctx.save();

  const hasFilter = bg.blur > 0 || bg.brightness !== 100;
  if (hasFilter && 'filter' in ctx) {
    const blurPx = Math.max(0, bg.blur);
    const brightPct = Math.max(10, bg.brightness);
    (ctx as CanvasRenderingContext2D).filter = `blur(${blurPx}px) brightness(${brightPct}%)`;
  }

  let mediaDrawn = false;

  if (bg.type === 'image' && bg.assetUrl) {
    const img = backgroundAssetCache.getImage(bg.assetUrl);
    if (img) {
      drawMediaCover(ctx, img, img.naturalWidth, img.naturalHeight, width, height);
      mediaDrawn = true;
    }
  } else if (bg.type === 'video' && bg.assetUrl) {
    const video =
      explicitVideoElement !== undefined
        ? explicitVideoElement
        : backgroundAssetCache.getVideo(bg.assetUrl, songTime, isPlaying);
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      drawMediaCover(ctx, video, video.videoWidth, video.videoHeight, width, height);
      mediaDrawn = true;
    }
  }

  if (!mediaDrawn) {
    const animatedAngle = bg.animateGradient
      ? (bg.gradientAngle + songTime * 12) % 360
      : bg.gradientAngle;
    const rad = (animatedAngle * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.hypot(width, height) / 2;

    const x0 = cx - Math.cos(rad) * radius;
    const y0 = cy - Math.sin(rad) * radius;
    const x1 = cx + Math.cos(rad) * radius;
    const y1 = cy + Math.sin(rad) * radius;

    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, bg.color1 || '#0f172a');
    grad.addColorStop(1, bg.color2 || '#1e1b4b');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
}

function renderAmbientEffectsLayer(
  ctx: RenderContext2D,
  bg: BackgroundConfig,
  width: number,
  height: number,
  songTime: number
): void {
  if (bg.particles) {
    ctx.save();
    const particleCount = 36;

    for (let i = 0; i < particleCount; i++) {
      const seed1 = Math.sin(i * 12.9898) * 43758.5453;
      const seed2 = Math.cos(i * 78.233) * 23421.6312;
      const frac1 = seed1 - Math.floor(seed1);
      const frac2 = seed2 - Math.floor(seed2);

      const speedY = 14 + (i % 5) * 6;
      const driftX = Math.sin(songTime * 0.7 + i) * 24;

      const baseX = frac1 * width;
      const baseY = frac2 * height;

      const x = (baseX + driftX + width) % width;
      const y = (baseY - songTime * speedY + height * 100) % height;

      const radius = 1.5 + (i % 4) * 1.3;
      const alpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(songTime * 1.8 + i * 2));

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx.fill();
    }
    ctx.restore();
  }

  if (bg.vignette) {
    ctx.save();
    const cx = width / 2;
    const cy = height / 2;
    const innerR = Math.min(width, height) * 0.28;
    const outerR = Math.hypot(width, height) * 0.55;

    const vignetteGrad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignetteGrad.addColorStop(1, 'rgba(0, 0, 0, 0.68)');

    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

function layoutWrappedWords(
  ctx: RenderContext2D,
  words: LyricWord[],
  maxWidth: number,
  anchorX: number,
  startY: number,
  lineHeightPx: number,
  align: 'left' | 'center' | 'right'
): WrappedLineLayout {
  const spaceWidth = ctx.measureText(' ').width;
  const rows: Array<{ items: Array<{ word: LyricWord; width: number }>; rowWidth: number }> = [];

  let currentRow: Array<{ word: LyricWord; width: number }> = [];
  let currentWidth = 0;

  for (const word of words) {
    const wWidth = ctx.measureText(word.text).width;
    const nextWidth = currentRow.length === 0 ? wWidth : currentWidth + spaceWidth + wWidth;

    if (currentRow.length > 0 && nextWidth > maxWidth) {
      rows.push({ items: currentRow, rowWidth: currentWidth });
      currentRow = [{ word, width: wWidth }];
      currentWidth = wWidth;
    } else {
      currentRow.push({ word, width: wWidth });
      currentWidth = nextWidth;
    }
  }

  if (currentRow.length > 0) {
    rows.push({ items: currentRow, rowWidth: currentWidth });
  }

  const positionedWords: PositionedWord[] = [];
  let charCounter = 0;

  rows.forEach((row, rowIndex) => {
    const rowY = startY + rowIndex * lineHeightPx;
    let cursorX = anchorX;

    if (align === 'center') {
      cursorX = anchorX - row.rowWidth / 2;
    } else if (align === 'right') {
      cursorX = anchorX - row.rowWidth;
    }

    row.items.forEach((item) => {
      positionedWords.push({
        word: item.word,
        x: cursorX,
        y: rowY,
        width: item.width,
        charIndexStart: charCounter,
      });
      cursorX += item.width + spaceWidth;
      charCounter += item.word.text.length;
    });
  });

  return {
    words: positionedWords,
    totalChars: Math.max(1, charCounter),
    blockHeight: rows.length * lineHeightPx,
  };
}

function computeLineAnimation(
  animation: TextStyle['animation'],
  line: LyricLine,
  songTime: number
): { alpha: number; offsetY: number; scale: number; typewriterRatio: number } {
  const start = line.startTime ?? songTime;
  const end = line.endTime ?? start + 3.5;
  const elapsed = Math.max(0, songTime - start);
  const remaining = Math.max(0, end - songTime);
  const enterWindow = 0.28;
  const exitWindow = 0.22;

  const enterT = Math.min(1, elapsed / enterWindow);
  const exitT = Math.min(1, remaining / exitWindow);
  const smoothEnter = 1 - Math.pow(1 - enterT, 3);

  switch (animation) {
    case 'fade':
      return {
        alpha: Math.min(smoothEnter, exitT),
        offsetY: 0,
        scale: 1,
        typewriterRatio: 1,
      };
    case 'slide':
      return {
        alpha: Math.min(smoothEnter, exitT),
        offsetY: (1 - smoothEnter) * 22,
        scale: 1,
        typewriterRatio: 1,
      };
    case 'scale':
      return {
        alpha: Math.min(smoothEnter, exitT),
        offsetY: 0,
        scale: 0.88 + 0.12 * smoothEnter,
        typewriterRatio: 1,
      };
    case 'typewriter': {
      const totalSpan = Math.max(0.4, (end - start) * 0.75);
      const ratio = Math.max(0, Math.min(1, elapsed / totalSpan));
      return {
        alpha: 1,
        offsetY: 0,
        scale: 1,
        typewriterRatio: ratio,
      };
    }
    case 'none':
    default:
      return { alpha: 1, offsetY: 0, scale: 1, typewriterRatio: 1 };
  }
}

function renderContextLyricLine(
  ctx: RenderContext2D,
  line: LyricLine,
  style: TextStyle,
  anchorX: number,
  y: number,
  maxWidth: number,
  scaleFactor: number,
  opacity: number
): void {
  if (!line.text.trim()) return;

  ctx.save();
  const contextFontSize = Math.round(style.fontSize * scaleFactor * 0.74);
  ctx.font = `${style.fontWeight} ${contextFontSize}px "${style.fontFamily}", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = opacity;

  const words = getLineWordsWithInterpolatedTiming(line);
  const layout = layoutWrappedWords(
    ctx,
    words,
    maxWidth,
    anchorX,
    y,
    contextFontSize * 1.3,
    style.align
  );

  for (const pw of layout.words) {
    if (style.strokeWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, style.strokeWidth * scaleFactor * 0.7);
      ctx.strokeStyle = style.strokeColor;
      ctx.strokeText(pw.word.text, pw.x, pw.y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(pw.word.text, pw.x, pw.y);
  }

  ctx.restore();
}

function renderActiveLyricLine(
  ctx: RenderContext2D,
  line: LyricLine,
  style: TextStyle,
  songTime: number,
  anchorX: number,
  baseY: number,
  maxWidth: number,
  scaleFactor: number
): number {
  const words = getLineWordsWithInterpolatedTiming(line);
  if (words.length === 0) return 0;

  const fontSizePx = Math.round(style.fontSize * scaleFactor);
  const lineHeightPx = Math.round(fontSizePx * (style.lineHeight || 1.38));

  ctx.save();
  ctx.font = `${style.fontWeight} ${fontSizePx}px "${style.fontFamily}", sans-serif`;
  ctx.textBaseline = 'alphabetic';

  const layout = layoutWrappedWords(
    ctx,
    words,
    maxWidth,
    anchorX,
    baseY,
    lineHeightPx,
    style.align
  );

  const anim = computeLineAnimation(style.animation, line, songTime);
  const centerY = baseY + (layout.blockHeight - lineHeightPx) / 2;

  ctx.globalAlpha = anim.alpha;
  ctx.translate(anchorX, centerY + anim.offsetY);
  ctx.scale(anim.scale, anim.scale);
  ctx.translate(-anchorX, -centerY);

  const activeFillColor =
    line.singer === 'B'
      ? style.secondarySingerColor || '#ec4899'
      : style.highlightColor || '#22d3ee';

  const maxVisibleChars =
    style.animation === 'typewriter'
      ? Math.ceil(layout.totalChars * anim.typewriterRatio)
      : layout.totalChars;

  for (const pw of layout.words) {
    if (style.animation === 'typewriter' && pw.charIndexStart >= maxVisibleChars) {
      continue;
    }

    const displayText =
      style.animation === 'typewriter'
        ? pw.word.text.slice(0, Math.max(0, maxVisibleChars - pw.charIndexStart))
        : pw.word.text;

    if (!displayText) continue;

    ctx.save();
    if (style.shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.82)';
      ctx.shadowBlur = 10 * scaleFactor;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4 * scaleFactor;
    }

    if (style.strokeWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = style.strokeWidth * scaleFactor;
      ctx.strokeStyle = style.strokeColor;
      ctx.strokeText(displayText, pw.x, pw.y);
    }

    ctx.fillStyle = style.color;
    ctx.fillText(displayText, pw.x, pw.y);
    ctx.restore();

    const progress = computeWordProgress(pw.word, songTime);
    if (progress > 0) {
      ctx.save();
      const pad = Math.ceil((style.strokeWidth + 8) * scaleFactor);
      const fillWidth = pw.width * progress;

      ctx.beginPath();
      ctx.rect(
        pw.x - (progress > 0.02 ? 2 : 0),
        pw.y - fontSizePx * 1.15,
        fillWidth + (progress >= 0.99 ? pad : 2),
        fontSizePx * 1.55
      );
      ctx.clip();

      if (style.glow) {
        ctx.shadowColor = activeFillColor;
        ctx.shadowBlur = 18 * scaleFactor;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      if (style.strokeWidth > 0) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = style.strokeWidth * scaleFactor;
        ctx.strokeStyle = style.strokeColor;
        ctx.strokeText(displayText, pw.x, pw.y);
      }

      ctx.fillStyle = activeFillColor;
      ctx.fillText(displayText, pw.x, pw.y);
      ctx.restore();
    }
  }

  ctx.restore();
  return layout.blockHeight;
}

function renderOverlaysLayer(
  ctx: RenderContext2D,
  project: KaraokeProject,
  songTime: number,
  width: number,
  height: number,
  scaleFactor: number,
  isExporting: boolean
): void {
  const { settings, lyrics } = project;
  const { textStyle } = settings;

  const firstTimedLine = lyrics.find((l) => l.startTime !== null);
  const firstStartTime = firstTimedLine?.startTime ?? null;

  if (
    textStyle.showIntroTitle !== false &&
    settings.title &&
    (firstStartTime === null || firstStartTime >= 2.2) &&
    songTime >= 0 &&
    songTime < Math.min(4.0, (firstStartTime ?? 4.5) - 0.3)
  ) {
    const introEnd = Math.min(4.0, (firstStartTime ?? 4.5) - 0.3);
    const fadeIn = Math.min(1, songTime / 0.45);
    const fadeOut = Math.min(1, (introEnd - songTime) / 0.45);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const titleSize = Math.round(44 * scaleFactor);
    ctx.font = `800 ${titleSize}px "${textStyle.fontFamily}", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 14 * scaleFactor;
    ctx.fillText(settings.title, width / 2, height * 0.24);

    if (settings.artist) {
      const artistSize = Math.round(22 * scaleFactor);
      ctx.font = `600 ${artistSize}px "${textStyle.fontFamily}", sans-serif`;
      ctx.fillStyle = textStyle.highlightColor || '#22d3ee';
      ctx.fillText(settings.artist, width / 2, height * 0.24 + titleSize * 0.95);
    }
    ctx.restore();
  }

  if (textStyle.showCountdown !== false) {
    let upcomingStart: number | null = null;

    for (let i = 0; i < lyrics.length; i++) {
      const lineStart = lyrics[i].startTime;
      if (lineStart === null) continue;
      const prevEnd = i > 0 ? lyrics[i - 1].endTime ?? lyrics[i - 1].startTime ?? 0 : 0;
      const gap = i === 0 ? lineStart : lineStart - prevEnd;

      if (gap >= 3.2 && songTime >= lineStart - 3.0 && songTime < lineStart) {
        upcomingStart = lineStart;
        break;
      }
    }

    if (upcomingStart !== null) {
      const timeRemaining = upcomingStart - songTime;
      const countNumber = Math.ceil(timeRemaining);
      const progress = 1 - timeRemaining / 3.0;

      ctx.save();
      const pillW = 150 * scaleFactor;
      const pillH = 42 * scaleFactor;
      const pillX = (width - pillW) / 2;
      const pillY = height * 0.14;

      ctx.fillStyle = 'rgba(9, 11, 16, 0.78)';
      ctx.strokeStyle = textStyle.highlightColor || '#22d3ee';
      ctx.lineWidth = 2 * scaleFactor;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 21 * scaleFactor);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.round(20 * scaleFactor)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`VÀO NHỊP: ${countNumber}`, width / 2, pillY + pillH * 0.45);

      const barMargin = 16 * scaleFactor;
      const maxBarW = pillW - barMargin * 2;
      ctx.fillStyle = textStyle.highlightColor || '#22d3ee';
      ctx.fillRect(
        pillX + barMargin,
        pillY + pillH - 7 * scaleFactor,
        maxBarW * Math.max(0, Math.min(1, progress)),
        3 * scaleFactor
      );
      ctx.restore();
    }
  }

  if (textStyle.showWatermark && textStyle.watermarkText?.trim()) {
    ctx.save();
    const wmSize = Math.round(18 * scaleFactor);
    ctx.font = `700 ${wmSize}px "${textStyle.fontFamily}", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 6 * scaleFactor;
    ctx.fillText(
      textStyle.watermarkText.trim(),
      width - 28 * scaleFactor,
      24 * scaleFactor
    );
    ctx.restore();
  }

  if (textStyle.safeAreaOverlay && !isExporting) {
    ctx.save();
    const padTop = height * 0.12;
    const padBottom = height * 0.22;
    const padLeft = width * 0.06;
    const padRight = width * 0.16;

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
    ctx.lineWidth = Math.max(1.5, 2 * scaleFactor);
    ctx.setLineDash([8 * scaleFactor, 6 * scaleFactor]);
    ctx.strokeRect(
      padLeft,
      padTop,
      width - padLeft - padRight,
      height - padTop - padBottom
    );

    ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
    ctx.font = `600 ${Math.round(14 * scaleFactor)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('VÙNG AN TOÀN TIKTOK / REELS', padLeft + 8 * scaleFactor, padTop + 18 * scaleFactor);
    ctx.restore();
  }
}

export function renderKaraokeFrame(
  targetCtx: RenderContext2D,
  options: RenderFrameOptions
): void {
  const {
    project,
    songTime,
    width,
    height,
    isPlaying = false,
    isExporting = false,
    explicitVideoElement,
  } = options;

  const backbuffer = !isExporting ? getBackbuffer(width, height) : null;
  const ctx: RenderContext2D = backbuffer ? backbuffer.ctx : targetCtx;

  ctx.clearRect(0, 0, width, height);

  const { settings, lyrics } = project;
  const { textStyle, background } = settings;

  const minEdge = Math.min(width, height);
  const scaleFactor = minEdge / 1080;

  renderBackgroundLayer(
    ctx,
    background,
    width,
    height,
    songTime,
    isPlaying,
    explicitVideoElement
  );

  renderAmbientEffectsLayer(ctx, background, width, height, songTime);

  const { activeIndex, prevIndex, nextIndex } = findActiveLineIndex(lyrics, songTime);

  const isVertical = settings.aspectRatio === '9:16' || settings.aspectRatio === '4:5';
  const sidePadding = isVertical ? width * 0.1 : width * 0.08;
  const maxTextWidth = Math.max(200, width - sidePadding * 2);

  let anchorX = width / 2;
  if (textStyle.align === 'left') {
    anchorX = sidePadding;
  } else if (textStyle.align === 'right') {
    anchorX = width - sidePadding;
  }

  let activeBaseY = height * 0.52;
  if (textStyle.verticalPosition === 'top') {
    activeBaseY = height * 0.26;
  } else if (textStyle.verticalPosition === 'bottom') {
    activeBaseY = isVertical ? height * 0.68 : height * 0.76;
  }

  const lineGap = Math.round(textStyle.fontSize * scaleFactor * 1.45);

  if (prevIndex !== -1 && lyrics[prevIndex]) {
    renderContextLyricLine(
      ctx,
      lyrics[prevIndex],
      textStyle,
      anchorX,
      activeBaseY - lineGap,
      maxTextWidth,
      scaleFactor,
      0.34
    );
  }

  let activeBlockHeight = lineGap;
  if (activeIndex !== -1 && lyrics[activeIndex]) {
    activeBlockHeight = renderActiveLyricLine(
      ctx,
      lyrics[activeIndex],
      textStyle,
      songTime,
      anchorX,
      activeBaseY,
      maxTextWidth,
      scaleFactor
    );
  }

  if (nextIndex !== -1 && lyrics[nextIndex]) {
    const nextOpacity = activeIndex === -1 ? 0.65 : 0.45;
    renderContextLyricLine(
      ctx,
      lyrics[nextIndex],
      textStyle,
      anchorX,
      activeBaseY + Math.max(lineGap, activeBlockHeight + 12 * scaleFactor),
      maxTextWidth,
      scaleFactor,
      nextOpacity
    );
  }

  renderOverlaysLayer(
    ctx,
    project,
    songTime,
    width,
    height,
    scaleFactor,
    isExporting
  );

  if (backbuffer && targetCtx !== backbuffer.ctx) {
    targetCtx.clearRect(0, 0, width, height);
    targetCtx.drawImage(backbuffer.surface, 0, 0, width, height);
  }
}
