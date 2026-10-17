import { LyricLine, LyricWord, TimingValidationIssue } from '../../types/project';
import { tokenizeLineIntoWords } from '../lyric-parser/lyricParser';

export interface ActiveLyricLookupResult {
  activeIndex: number;
  prevIndex: number;
  nextIndex: number;
}

export function sortLyricsByStartTime(lines: LyricLine[]): LyricLine[] {
  return [...lines].sort((a, b) => {
    if (a.startTime === null && b.startTime === null) return 0;
    if (a.startTime === null) return 1;
    if (b.startTime === null) return -1;
    return a.startTime - b.startTime;
  });
}

export function findActiveLineIndex(
  lines: LyricLine[],
  songTime: number
): ActiveLyricLookupResult {
  const n = lines.length;
  if (n === 0) {
    return { activeIndex: -1, prevIndex: -1, nextIndex: -1 };
  }

  let timedCount = n;
  while (timedCount > 0 && lines[timedCount - 1].startTime === null) {
    timedCount--;
  }

  if (timedCount === 0) {
    return { activeIndex: -1, prevIndex: -1, nextIndex: 0 };
  }

  let low = 0;
  let high = timedCount - 1;
  let candidate = -1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midStart = lines[mid].startTime;

    if (midStart !== null && midStart <= songTime) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (candidate === -1) {
    return {
      activeIndex: -1,
      prevIndex: -1,
      nextIndex: 0,
    };
  }

  const candidateLine = lines[candidate];
  const nextLine = candidate + 1 < timedCount ? lines[candidate + 1] : null;
  const effectiveEnd =
    candidateLine.endTime ??
    (nextLine?.startTime !== null && nextLine?.startTime !== undefined
      ? nextLine.startTime
      : (candidateLine.startTime ?? 0) + 4.0);

  if (songTime <= effectiveEnd) {
    return {
      activeIndex: candidate,
      prevIndex: candidate > 0 ? candidate - 1 : -1,
      nextIndex: candidate + 1 < n ? candidate + 1 : -1,
    };
  }

  return {
    activeIndex: -1,
    prevIndex: candidate,
    nextIndex: candidate + 1 < n ? candidate + 1 : -1,
  };
}

export function computeWordProgress(word: LyricWord, songTime: number): number {
  if (word.startTime === null || word.endTime === null) {
    return 0;
  }
  if (songTime < word.startTime) {
    return 0;
  }
  if (songTime >= word.endTime || word.endTime <= word.startTime) {
    return 1;
  }
  const progress = (songTime - word.startTime) / (word.endTime - word.startTime);
  return Math.max(0, Math.min(1, progress));
}

export function getLineWordsWithInterpolatedTiming(line: LyricLine): LyricWord[] {
  const words =
    line.words && line.words.length > 0
      ? line.words
      : tokenizeLineIntoWords(line.text, line.startTime, line.endTime);

  if (line.startTime === null) {
    return words;
  }

  const lineStart = line.startTime;
  const lineEnd =
    line.endTime !== null && line.endTime > lineStart ? line.endTime : lineStart + 3.0;

  const allWordsTimed = words.every(
    (w) => w.startTime !== null && w.endTime !== null && w.endTime >= w.startTime
  );
  if (allWordsTimed) {
    return words;
  }

  const totalChars = words.reduce((acc, w) => acc + Math.max(1, w.text.length), 0);
  const totalDuration = Math.max(0.2, lineEnd - lineStart);
  let cursor = lineStart;

  return words.map((w, idx) => {
    const ratio = Math.max(1, w.text.length) / totalChars;
    const start = Number(cursor.toFixed(3));
    const end =
      idx === words.length - 1
        ? Number(lineEnd.toFixed(3))
        : Number((cursor + totalDuration * ratio).toFixed(3));
    cursor = end;

    return {
      ...w,
      startTime: w.startTime ?? start,
      endTime: w.endTime ?? end,
    };
  });
}

export function convertLineTimingToWordTiming(lines: LyricLine[]): LyricLine[] {
  return lines.map((line) => ({
    ...line,
    words: getLineWordsWithInterpolatedTiming(line),
  }));
}

export function validateLyricsTiming(
  lines: LyricLine[],
  trackDuration: number
): TimingValidationIssue[] {
  const issues: TimingValidationIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : null;

    if (line.startTime === null) continue;

    if (line.startTime < 0 || (line.endTime !== null && line.endTime < 0)) {
      issues.push({
        lineId: line.id,
        lineIndex: i,
        type: 'negative',
        messageVi: `Dòng #${i + 1}: Timestamp không được âm (${line.startTime.toFixed(2)}s).`,
        messageEn: `Line #${i + 1}: Negative timestamp (${line.startTime.toFixed(2)}s).`,
      });
    }

    if (trackDuration > 0 && line.startTime > trackDuration + 0.05) {
      issues.push({
        lineId: line.id,
        lineIndex: i,
        type: 'exceeds_duration',
        messageVi: `Dòng #${i + 1}: Bắt đầu (${line.startTime.toFixed(2)}s) vượt quá thời lượng bài hát (${trackDuration.toFixed(2)}s).`,
        messageEn: `Line #${i + 1}: Start time (${line.startTime.toFixed(2)}s) exceeds track duration (${trackDuration.toFixed(2)}s).`,
      });
    }

    if (prev && prev.startTime !== null) {
      if (line.startTime < prev.startTime) {
        issues.push({
          lineId: line.id,
          lineIndex: i,
          type: 'out_of_order',
          messageVi: `Dòng #${i + 1}: Thời gian bắt đầu (${line.startTime.toFixed(2)}s) nhỏ hơn dòng trước (#${i}: ${prev.startTime.toFixed(2)}s).`,
          messageEn: `Line #${i + 1}: Start time (${line.startTime.toFixed(2)}s) is earlier than line #${i} (${prev.startTime.toFixed(2)}s).`,
        });
      } else if (Math.abs(line.startTime - prev.startTime) < 0.01) {
        issues.push({
          lineId: line.id,
          lineIndex: i,
          type: 'overlap',
          messageVi: `Dòng #${i + 1}: Trùng mốc thời gian bắt đầu với dòng #${i} (${line.startTime.toFixed(2)}s).`,
          messageEn: `Line #${i + 1}: Duplicate start timestamp with line #${i} (${line.startTime.toFixed(2)}s).`,
        });
      }
    }
  }

  return issues;
}

export function nudgeLineTiming(
  lines: LyricLine[],
  lineIndex: number,
  deltaSeconds: number
): LyricLine[] {
  return lines.map((line, idx) => {
    if (idx !== lineIndex) return line;
    const baseStart = line.startTime ?? 0;
    const nextStart = Number(Math.max(0, baseStart + deltaSeconds).toFixed(3));
    const appliedDelta = nextStart - baseStart;

    const nextEnd =
      line.endTime !== null
        ? Number(Math.max(nextStart + 0.2, line.endTime + appliedDelta).toFixed(3))
        : null;

    const nextWords = line.words.map((w) => ({
      ...w,
      startTime:
        w.startTime !== null
          ? Number(Math.max(0, w.startTime + appliedDelta).toFixed(3))
          : null,
      endTime:
        w.endTime !== null
          ? Number(Math.max(0, w.endTime + appliedDelta).toFixed(3))
          : null,
    }));

    return {
      ...line,
      startTime: nextStart,
      endTime: nextEnd,
      words: nextWords,
    };
  });
}

export function shiftLinesFromIndex(
  lines: LyricLine[],
  startIndex: number,
  deltaSeconds: number
): LyricLine[] {
  return lines.map((line, idx) => {
    if (idx < startIndex || line.startTime === null) return line;
    const newStart = Number(Math.max(0, line.startTime + deltaSeconds).toFixed(3));
    const actualDelta = newStart - line.startTime;
    const newEnd =
      line.endTime !== null
        ? Number(Math.max(newStart + 0.2, line.endTime + actualDelta).toFixed(3))
        : null;

    return {
      ...line,
      startTime: newStart,
      endTime: newEnd,
      words: line.words.map((w) => ({
        ...w,
        startTime:
          w.startTime !== null
            ? Number(Math.max(0, w.startTime + actualDelta).toFixed(3))
            : null,
        endTime:
          w.endTime !== null
            ? Number(Math.max(0, w.endTime + actualDelta).toFixed(3))
            : null,
      })),
    };
  });
}

export function applyLineTapTimestamp(
  lines: LyricLine[],
  lineIndex: number,
  tapTime: number,
  trackDuration: number
): LyricLine[] {
  if (lineIndex < 0 || lineIndex >= lines.length) return lines;

  const clampedTap = Number(Math.max(0, tapTime).toFixed(3));
  const nextLines = structuredClone(lines);

  if (lineIndex > 0) {
    const prev = nextLines[lineIndex - 1];
    if (prev.startTime !== null && clampedTap > prev.startTime) {
      prev.endTime = clampedTap;
      prev.words = tokenizeLineIntoWords(prev.text, prev.startTime, prev.endTime);
    }
  }

  const current = nextLines[lineIndex];
  const following = nextLines[lineIndex + 1];
  const defaultEnd =
    following && following.startTime !== null && following.startTime > clampedTap
      ? following.startTime
      : Number(Math.min(trackDuration || clampedTap + 3.5, clampedTap + 3.5).toFixed(3));

  current.startTime = clampedTap;
  current.endTime = Math.max(clampedTap + 0.3, defaultEnd);
  current.words = tokenizeLineIntoWords(current.text, current.startTime, current.endTime);

  return nextLines;
}

export function applyWordTapTimestamp(
  lines: LyricLine[],
  lineIndex: number,
  wordIndex: number,
  tapTime: number,
  trackDuration: number
): {
  updatedLines: LyricLine[];
  nextLineIndex: number;
  nextWordIndex: number;
} {
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { updatedLines: lines, nextLineIndex: 0, nextWordIndex: 0 };
  }

  const clampedTap = Number(Math.max(0, tapTime).toFixed(3));
  const nextLines = structuredClone(lines);
  const line = nextLines[lineIndex];

  if (!line.words || line.words.length === 0) {
    line.words = tokenizeLineIntoWords(line.text, null, null);
  }

  const safeWordIdx = Math.max(0, Math.min(line.words.length - 1, wordIndex));

  if (safeWordIdx === 0) {
    line.startTime = clampedTap;
    if (lineIndex > 0) {
      const prevLine = nextLines[lineIndex - 1];
      if (prevLine.startTime !== null && clampedTap > prevLine.startTime) {
        prevLine.endTime = clampedTap;
        const lastPrevWord = prevLine.words[prevLine.words.length - 1];
        if (lastPrevWord && lastPrevWord.startTime !== null && clampedTap > lastPrevWord.startTime) {
          lastPrevWord.endTime = clampedTap;
        }
      }
    }
  }

  if (safeWordIdx > 0) {
    const prevWord = line.words[safeWordIdx - 1];
    if (prevWord.startTime !== null && clampedTap >= prevWord.startTime) {
      prevWord.endTime = clampedTap;
    }
  }

  const currentWord = line.words[safeWordIdx];
  currentWord.startTime = clampedTap;
  const provisionalEnd = Number(
    Math.min(trackDuration || clampedTap + 0.5, clampedTap + 0.45).toFixed(3)
  );
  currentWord.endTime = Math.max(clampedTap + 0.1, provisionalEnd);
  line.endTime = Math.max(line.endTime ?? 0, currentWord.endTime);

  if (safeWordIdx + 1 < line.words.length) {
    return {
      updatedLines: nextLines,
      nextLineIndex: lineIndex,
      nextWordIndex: safeWordIdx + 1,
    };
  }

  const nextLineIndex = Math.min(nextLines.length - 1, lineIndex + 1);
  return {
    updatedLines: nextLines,
    nextLineIndex,
    nextWordIndex: 0,
  };
}
