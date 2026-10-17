import React, { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { audioEngine } from '../../features/audio-engine/audioEngine';
import { nudgeLineTiming } from '../../features/timing-engine/timingEngine';
import { formatTimeDisplay } from '../../utils/time';

export const WaveformCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggingMarkerIndex, setDraggingMarkerIndex] = useState<number | null>(null);
  const [hoveredMarkerIndex, setHoveredMarkerIndex] = useState<number | null>(null);
  const dragSnapshotTakenRef = useRef(false);

  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(800);

  const peaks = useProjectStore((s) => s.waveformPeaks);
  const currentTime = useProjectStore((s) => s.currentTime);
  const duration = useProjectStore((s) => s.duration);
  const zoom = useProjectStore((s) => s.timelineZoom);
  const lyrics = useProjectStore((s) => s.project.lyrics);
  const trimStart = useProjectStore((s) => s.project.settings.trimStart);
  const trimEnd = useProjectStore((s) => s.project.settings.trimEnd);
  const loopRegion = useProjectStore((s) => s.loopRegion);
  const activeSyncLineIndex = useProjectStore((s) => s.activeSyncLineIndex);
  const setActiveSyncLineIndex = useProjectStore((s) => s.setActiveSyncLineIndex);
  const setLyricsWithHistory = useProjectStore((s) => s.setLyricsWithHistory);
  const setLyricsSilent = useProjectStore((s) => s.setLyricsSilent);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      setViewportWidth(el.clientWidth || 800);
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totalVirtualWidth = Math.max(viewportWidth, viewportWidth * zoom);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || isScrubbing || draggingMarkerIndex !== null || duration <= 0) return;

    const playheadX = (currentTime / duration) * totalVirtualWidth;
    const viewStart = el.scrollLeft;
    const viewEnd = viewStart + el.clientWidth;

    if (playheadX > viewEnd - 40) {
      el.scrollLeft = playheadX - el.clientWidth * 0.25;
    } else if (playheadX < viewStart) {
      el.scrollLeft = Math.max(0, playheadX - 40);
    }
  }, [currentTime, duration, totalVirtualWidth, isScrubbing, draggingMarkerIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const height = 116;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewportWidth * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = viewportWidth + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, viewportWidth, height);

    const safeDuration = Math.max(0.1, duration);
    const timeToX = (t: number) => (t / safeDuration) * totalVirtualWidth - scrollLeft;

    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, viewportWidth, height);

    ctx.fillStyle = '#11151f';
    ctx.fillRect(0, 0, viewportWidth, 22);
    ctx.strokeStyle = '#252d40';
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.lineTo(viewportWidth, 22);
    ctx.stroke();

    const secondsPerPixel = safeDuration / totalVirtualWidth;
    const targetTickPx = 90;
    const rawStep = secondsPerPixel * targetTickPx;
    const niceSteps = [0.5, 1, 2, 5, 10, 15, 30, 60];
    const tickStep = niceSteps.find((s) => s >= rawStep) || 60;

    const firstVisibleSecond = Math.floor((scrollLeft * secondsPerPixel) / tickStep) * tickStep;
    const lastVisibleSecond =
      Math.ceil(((scrollLeft + viewportWidth) * secondsPerPixel) / tickStep) * tickStep;

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    for (let sec = firstVisibleSecond; sec <= lastVisibleSecond; sec += tickStep) {
      if (sec < 0 || sec > safeDuration) continue;
      const x = timeToX(sec);
      ctx.strokeStyle = '#252d40';
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x, 22);
      ctx.stroke();
      ctx.fillText(formatTimeDisplay(sec, tickStep < 1), x + 3, 14);
    }

    const waveTop = 24;
    const waveHeight = height - waveTop - 6;
    const waveMidY = waveTop + waveHeight / 2;

    ctx.strokeStyle = '#181e2c';
    ctx.beginPath();
    ctx.moveTo(0, waveMidY);
    ctx.lineTo(viewportWidth, waveMidY);
    ctx.stroke();

    if (peaks.length > 0) {
      const barStep = 3;
      const barWidth = 2;
      const playheadX = timeToX(currentTime);

      for (let x = 0; x < viewportWidth; x += barStep) {
        const virtualX = x + scrollLeft;
        const ratio = virtualX / totalVirtualWidth;
        if (ratio < 0 || ratio > 1) continue;

        const peakIndex = Math.min(peaks.length - 1, Math.floor(ratio * peaks.length));
        const amplitude = peaks[peakIndex] || 0.04;
        const halfBar = Math.max(2, (amplitude * waveHeight) / 2);

        ctx.fillStyle = x <= playheadX ? '#22d3ee' : '#475569';
        ctx.fillRect(x, waveMidY - halfBar, barWidth, halfBar * 2);
      }
    } else {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Chưa có sóng âm — Hãy tải file nhạc (MP3, WAV, M4A, OGG, FLAC) hoặc kéo các mốc L1, L2 trên trục thời gian',
        viewportWidth / 2,
        waveMidY + 4
      );
    }

    if (loopRegion && loopRegion.end > loopRegion.start) {
      const loopStartX = Math.max(0, timeToX(loopRegion.start));
      const loopEndX = Math.min(viewportWidth, timeToX(loopRegion.end));
      if (loopEndX > loopStartX) {
        ctx.fillStyle = 'rgba(99, 102, 241, 0.16)';
        ctx.fillRect(loopStartX, 22, loopEndX - loopStartX, height - 22);
        ctx.strokeStyle = '#818cf8';
        ctx.strokeRect(loopStartX, 22, loopEndX - loopStartX, height - 22);
      }
    }

    if (trimStart > 0) {
      const trimStartX = timeToX(trimStart);
      if (trimStartX > 0) {
        ctx.fillStyle = 'rgba(9, 11, 16, 0.72)';
        ctx.fillRect(0, 22, Math.min(viewportWidth, trimStartX), height - 22);
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(trimStartX, 22);
        ctx.lineTo(trimStartX, height);
        ctx.stroke();
      }
    }

    const effectiveTrimEnd = trimEnd ?? safeDuration;
    if (effectiveTrimEnd < safeDuration) {
      const trimEndX = timeToX(effectiveTrimEnd);
      if (trimEndX < viewportWidth) {
        const startX = Math.max(0, trimEndX);
        ctx.fillStyle = 'rgba(9, 11, 16, 0.72)';
        ctx.fillRect(startX, 22, viewportWidth - startX, height - 22);
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(trimEndX, 22);
        ctx.lineTo(trimEndX, height);
        ctx.stroke();
      }
    }

    lyrics.forEach((line, idx) => {
      if (line.startTime === null) return;
      const markerX = timeToX(line.startTime);
      if (markerX < -40 || markerX > viewportWidth + 40) return;

      const isSelected = idx === activeSyncLineIndex;
      const isHoveredOrDragged = idx === hoveredMarkerIndex || idx === draggingMarkerIndex;

      ctx.strokeStyle = isHoveredOrDragged
        ? '#facc15'
        : isSelected
        ? '#22d3ee'
        : 'rgba(16, 185, 129, 0.78)';
      ctx.lineWidth = isHoveredOrDragged || isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(markerX, 22);
      ctx.lineTo(markerX, height);
      ctx.stroke();
      ctx.lineWidth = 1;

      const flagWidth = 34;
      const flagHeight = 15;
      ctx.fillStyle = isHoveredOrDragged
        ? '#facc15'
        : isSelected
        ? '#22d3ee'
        : '#10b981';
      ctx.fillRect(markerX, 23, flagWidth, flagHeight);

      ctx.fillStyle = '#022c22';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('L' + (idx + 1), markerX + 4, 33);
    });

    const playheadX = timeToX(currentTime);
    if (playheadX >= -5 && playheadX <= viewportWidth + 5) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
      ctx.lineWidth = 1;

      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, 0);
      ctx.lineTo(playheadX + 6, 0);
      ctx.lineTo(playheadX, 9);
      ctx.closePath();
      ctx.fill();
    }
  }, [
    peaks,
    currentTime,
    duration,
    zoom,
    scrollLeft,
    viewportWidth,
    totalVirtualWidth,
    lyrics,
    trimStart,
    trimEnd,
    loopRegion,
    activeSyncLineIndex,
    hoveredMarkerIndex,
    draggingMarkerIndex,
  ]);

  const getTimeFromClientX = (clientX: number): number => {
    const container = containerRef.current;
    if (!container || duration <= 0) return 0;
    const rect = container.getBoundingClientRect();
    const clickX = clientX - rect.left + container.scrollLeft;
    const ratio = Math.max(0, Math.min(1, clickX / totalVirtualWidth));
    return Number((ratio * duration).toFixed(3));
  };

  const findHitMarkerIndex = (clientX: number, clientY: number): number | null => {
    const container = containerRef.current;
    if (!container || duration <= 0) return null;
    const rect = container.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const safeDuration = Math.max(0.1, duration);
    for (let i = 0; i < lyrics.length; i++) {
      const st = lyrics[i].startTime;
      if (st === null) continue;
      const markerX = (st / safeDuration) * totalVirtualWidth - container.scrollLeft;
      const hitFlag = localY >= 20 && localY <= 42 && localX >= markerX - 4 && localX <= markerX + 36;
      const hitLine = localY >= 22 && Math.abs(localX - markerX) <= 5;
      if (hitFlag || hitLine) {
        return i;
      }
    }
    return null;
  };

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const hitIndex = findHitMarkerIndex(e.clientX, e.clientY);
        if (hitIndex !== null) {
          setDraggingMarkerIndex(hitIndex);
          setActiveSyncLineIndex(hitIndex);
          dragSnapshotTakenRef.current = false;
          return;
        }
        setIsScrubbing(true);
        audioEngine.seek(getTimeFromClientX(e.clientX));
      }}
      onPointerMove={(e) => {
        if (draggingMarkerIndex !== null) {
          const targetTime = getTimeFromClientX(e.clientX);
          const currentLyrics = useProjectStore.getState().project.lyrics;
          const targetLine = currentLyrics[draggingMarkerIndex];
          if (!targetLine) return;

          const currentStart = targetLine.startTime ?? 0;
          const delta = targetTime - currentStart;
          const updated = nudgeLineTiming(currentLyrics, draggingMarkerIndex, delta);

          if (!dragSnapshotTakenRef.current) {
            setLyricsWithHistory(updated);
            dragSnapshotTakenRef.current = true;
          } else {
            setLyricsSilent(updated);
          }
          return;
        }

        if (isScrubbing) {
          audioEngine.seek(getTimeFromClientX(e.clientX));
          return;
        }

        const hoverIdx = findHitMarkerIndex(e.clientX, e.clientY);
        if (hoverIdx !== hoveredMarkerIndex) {
          setHoveredMarkerIndex(hoverIdx);
        }
      }}
      onPointerUp={(e) => {
        if (draggingMarkerIndex !== null || isScrubbing) {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDraggingMarkerIndex(null);
          setIsScrubbing(false);
          dragSnapshotTakenRef.current = false;
        }
      }}
      className={
        'flex-1 relative overflow-x-auto overflow-y-hidden bg-forge-bg select-none ' +
        (draggingMarkerIndex !== null || hoveredMarkerIndex !== null
          ? 'cursor-grab active:cursor-grabbing'
          : 'cursor-ew-resize')
      }
    >
      <div style={{ width: totalVirtualWidth + 'px', height: '100%' }} />
      <canvas ref={canvasRef} className="sticky left-0 top-0 pointer-events-none block" />
    </div>
  );
};
