import fs from 'node:fs';
import path from 'node:path';

const files = {
  'src/features/lyric-parser/lyricParser.ts': String.raw`import { KaraokeProject, LyricLine, LyricWord } from '../../types/project';
import { createId } from '../../utils/id';
import { formatSrtTimestamp, formatTimeDisplay } from '../../utils/time';

export type SupportedLyricFormat = 'elrc' | 'lrc' | 'srt' | 'json' | 'text';

const LRC_LINE_REGEX = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/;
const ELRC_WORD_REGEX = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>\s*([^<]+)/g;
const SRT_TIME_ARROW_REGEX =
  /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function parseMinutesSecondsFraction(
  minsStr: string,
  secsStr: string,
  fracStr?: string
): number {
  const mins = parseInt(minsStr, 10) || 0;
  const secs = parseInt(secsStr, 10) || 0;
  let frac = 0;
  if (fracStr) {
    const padded = fracStr.padEnd(3, '0').slice(0, 3);
    frac = parseInt(padded, 10) / 1000;
  }
  return Number((mins * 60 + secs + frac).toFixed(3));
}

function parseSrtTimeParts(
  hh: string,
  mm: string,
  ss: string,
  ms: string
): number {
  const hours = parseInt(hh, 10) || 0;
  const mins = parseInt(mm, 10) || 0;
  const secs = parseInt(ss, 10) || 0;
  const millis = parseInt(ms.padEnd(3, '0').slice(0, 3), 10) || 0;
  return Number((hours * 3600 + mins * 60 + secs + millis / 1000).toFixed(3));
}

export function tokenizeLineIntoWords(
  text: string,
  startTime: number | null = null,
  endTime: number | null = null
): LyricWord[] {
  const cleaned = text.trim();
  if (!cleaned) return [];

  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return [];

  const hasValidRange =
    startTime !== null &&
    endTime !== null &&
    endTime > startTime;

  if (!hasValidRange) {
    return rawTokens.map((token) => ({
      id: createId('w'),
      text: token,
      startTime: null,
      endTime: null,
    }));
  }

  const totalDuration = endTime - startTime;
  const totalChars = rawTokens.reduce((sum, token) => sum + Math.max(1, token.length), 0);
  let cursor = startTime;

  return rawTokens.map((token, idx) => {
    const weight = Math.max(1, token.length) / totalChars;
    const wordStart = Number(cursor.toFixed(3));
    const wordEnd =
      idx === rawTokens.length - 1
        ? Number(endTime.toFixed(3))
        : Number((cursor + totalDuration * weight).toFixed(3));
    cursor = wordEnd;

    return {
      id: createId('w'),
      text: token,
      startTime: wordStart,
      endTime: wordEnd,
    };
  });
}

export function detectLyricFormat(
  content: string,
  filename?: string
): SupportedLyricFormat {
  const trimmed = content.trim();
  const lowerName = (filename || '').toLowerCase();

  if (lowerName.endsWith('.json') || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && Array.isArray(parsed.lyrics)) {
        return 'json';
      }
    } catch {
      // Fall through
    }
  }

  if (lowerName.endsWith('.srt') || SRT_TIME_ARROW_REGEX.test(trimmed)) {
    return 'srt';
  }

  if (
    lowerName.endsWith('.elrc') ||
    (/\[\d{1,3}:\d{2}/.test(trimmed) && /<\d{1,3}:\d{2}/.test(trimmed))
  ) {
    return 'elrc';
  }

  if (lowerName.endsWith('.lrc') || /^\[\d{1,3}:\d{2}/m.test(trimmed)) {
    return 'lrc';
  }

  return 'text';
}

export function parsePlainText(content: string): LyricLine[] {
  const rows = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return rows.map((row) => {
    let singer: 'A' | 'B' = 'A';
    let cleanText = row;

    if (/^(B:|\[B\]|Nữ:|Ca sĩ B:)/i.test(row)) {
      singer = 'B';
      cleanText = row.replace(/^(B:|\[B\]|Nữ:|Ca sĩ B:)\s*/i, '').trim();
    } else if (/^(A:|\[A\]|Nam:|Ca sĩ A:)/i.test(row)) {
      singer = 'A';
      cleanText = row.replace(/^(A:|\[A\]|Nam:|Ca sĩ A:)\s*/i, '').trim();
    }

    return {
      id: createId('line'),
      text: cleanText,
      startTime: null,
      endTime: null,
      words: tokenizeLineIntoWords(cleanText, null, null),
      singer,
    };
  });
}

export function parseStandardLrc(content: string): LyricLine[] {
  const rawRows = content.replace(/\r\n/g, '\n').split('\n');
  const parsedLines: LyricLine[] = [];

  for (const raw of rawRows) {
    const lineStr = raw.trim();
    if (!lineStr) continue;

    if (/^\[(ti|ar|al|au|length|by|offset|re|ve):/i.test(lineStr)) {
      continue;
    }

    const match = lineStr.match(LRC_LINE_REGEX);
    if (!match) continue;

    const startTime = parseMinutesSecondsFraction(match[1], match[2], match[3]);
    const rawLyricText = match[4].replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').trim();

    if (!rawLyricText) continue;

    parsedLines.push({
      id: createId('line'),
      text: rawLyricText,
      startTime,
      endTime: null,
      words: [],
      singer: 'A',
    });
  }

  parsedLines.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

  for (let i = 0; i < parsedLines.length; i++) {
    const current = parsedLines[i];
    const next = parsedLines[i + 1];
    const start = current.startTime ?? 0;
    const inferredEnd =
      next && next.startTime !== null && next.startTime > start
        ? Number(Math.min(next.startTime, start + 6).toFixed(3))
        : Number((start + 3.5).toFixed(3));

    current.endTime = inferredEnd;
    current.words = tokenizeLineIntoWords(current.text, current.startTime, current.endTime);
  }

  return parsedLines;
}

export function parseEnhancedLrc(content: string): LyricLine[] {
  const rawRows = content.replace(/\r\n/g, '\n').split('\n');
  const parsedLines: LyricLine[] = [];

  for (const raw of rawRows) {
    const lineStr = raw.trim();
    if (!lineStr || /^\[(ti|ar|al|au|length|by|offset|re|ve):/i.test(lineStr)) {
      continue;
    }

    const match = lineStr.match(LRC_LINE_REGEX);
    if (!match) continue;

    const lineStartTime = parseMinutesSecondsFraction(match[1], match[2], match[3]);
    const body = match[4].trim();

    const words: LyricWord[] = [];
    let wordMatch: RegExpExecArray | null;
    const regex = new RegExp(ELRC_WORD_REGEX.source, 'g');

    while ((wordMatch = regex.exec(body)) !== null) {
      const wStart = parseMinutesSecondsFraction(wordMatch[1], wordMatch[2], wordMatch[3]);
      const wText = wordMatch[4].trim();
      if (wText) {
        const subTokens = wText.split(/\s+/).filter(Boolean);
        subTokens.forEach((sub, idx) => {
          words.push({
            id: createId('w'),
            text: sub,
            startTime: idx === 0 ? wStart : null,
            endTime: null,
          });
        });
      }
    }

    if (words.length === 0) {
      const plainText = body.replace(/<[^>]+>/g, '').trim();
      if (!plainText) continue;
      parsedLines.push({
        id: createId('line'),
        text: plainText,
        startTime: lineStartTime,
        endTime: null,
        words: [],
        singer: 'A',
      });
      continue;
    }

    const fullText = words.map((w) => w.text).join(' ');
    parsedLines.push({
      id: createId('line'),
      text: fullText,
      startTime: words[0].startTime ?? lineStartTime,
      endTime: null,
      words,
      singer: 'A',
    });
  }

  parsedLines.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

  for (let i = 0; i < parsedLines.length; i++) {
    const line = parsedLines[i];
    const nextLine = parsedLines[i + 1];
    const lineStart = line.startTime ?? 0;
    const defaultLineEnd =
      nextLine && nextLine.startTime !== null && nextLine.startTime > lineStart
        ? Number(Math.min(nextLine.startTime, lineStart + 6).toFixed(3))
        : Number((lineStart + 3.5).toFixed(3));

    if (line.words.length === 0) {
      line.endTime = defaultLineEnd;
      line.words = tokenizeLineIntoWords(line.text, lineStart, defaultLineEnd);
      continue;
    }

    for (let w = 0; w < line.words.length; w++) {
      const currWord = line.words[w];
      const prevWord = line.words[w - 1];
      const nextWord = line.words[w + 1];

      if (currWord.startTime === null) {
        currWord.startTime = prevWord?.endTime ?? prevWord?.startTime ?? lineStart;
      }
      if (nextWord && nextWord.startTime !== null && nextWord.startTime >= currWord.startTime) {
        currWord.endTime = nextWord.startTime;
      } else if (w === line.words.length - 1) {
        currWord.endTime = Math.max(currWord.startTime + 0.25, defaultLineEnd);
      } else {
        currWord.endTime = Number((currWord.startTime + 0.35).toFixed(3));
      }
    }

    const lastWordEnd = line.words[line.words.length - 1].endTime ?? defaultLineEnd;
    line.endTime = Math.max(lineStart + 0.2, lastWordEnd);
  }

  return parsedLines;
}

export function parseSrt(content: string): LyricLine[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n/);
  const lines: LyricLine[] = [];

  for (const block of blocks) {
    const rows = block
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);
    if (rows.length < 2) continue;

    const timeRowIndex = rows.findIndex((r) => SRT_TIME_ARROW_REGEX.test(r));
    if (timeRowIndex === -1) continue;

    const match = rows[timeRowIndex].match(SRT_TIME_ARROW_REGEX);
    if (!match) continue;

    const startTime = parseSrtTimeParts(match[1], match[2], match[3], match[4]);
    const endTime = parseSrtTimeParts(match[5], match[6], match[7], match[8]);
    const textContent = rows
      .slice(timeRowIndex + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (!textContent) continue;

    lines.push({
      id: createId('line'),
      text: textContent,
      startTime,
      endTime: endTime > startTime ? endTime : Number((startTime + 2.5).toFixed(3)),
      words: tokenizeLineIntoWords(
        textContent,
        startTime,
        endTime > startTime ? endTime : Number((startTime + 2.5).toFixed(3))
      ),
      singer: 'A',
    });
  }

  return lines;
}

export function parseLyricsAuto(
  content: string,
  filename?: string
): { format: SupportedLyricFormat; lines: LyricLine[] } {
  const format = detectLyricFormat(content, filename);

  switch (format) {
    case 'json': {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.lyrics)) {
          return { format: 'json', lines: parsed.lyrics };
        }
      } catch {
        // Fallback
      }
      return { format: 'text', lines: parsePlainText(content) };
    }
    case 'elrc':
      return { format: 'elrc', lines: parseEnhancedLrc(content) };
    case 'lrc':
      return { format: 'lrc', lines: parseStandardLrc(content) };
    case 'srt':
      return { format: 'srt', lines: parseSrt(content) };
    case 'text':
    default:
      return { format: 'text', lines: parsePlainText(content) };
  }
}

export function serializeToLrc(
  lines: LyricLine[],
  title = 'KaraokeForge Track',
  artist = 'KaraokeForge'
): string {
  const header = [
    '[ti:' + title + ']',
    '[ar:' + artist + ']',
    '[by:KaraokeForge Studio]',
    '',
  ];

  const body = lines.map((line) => {
    const tag = line.startTime !== null ? '[' + formatTimeDisplay(line.startTime) + ']' : '[00:00.00]';
    return tag + line.text;
  });

  return [...header, ...body].join('\n');
}

export function serializeToEnhancedLrc(
  lines: LyricLine[],
  title = 'KaraokeForge Track',
  artist = 'KaraokeForge'
): string {
  const header = [
    '[ti:' + title + ']',
    '[ar:' + artist + ']',
    '[by:KaraokeForge Studio (Enhanced Word-Level LRC)]',
    '',
  ];

  const body = lines.map((line) => {
    const lineTag =
      line.startTime !== null ? '[' + formatTimeDisplay(line.startTime) + ']' : '[00:00.00]';
    if (!line.words || line.words.length === 0) {
      return lineTag + line.text;
    }

    const wordSegments = line.words.map((w) => {
      const wTime = w.startTime ?? line.startTime ?? 0;
      return '<' + formatTimeDisplay(wTime) + '>' + w.text;
    });

    return lineTag + wordSegments.join(' ');
  });

  return [...header, ...body].join('\n');
}

export function serializeToSrt(lines: LyricLine[]): string {
  return lines
    .map((line, index) => {
      const start = line.startTime ?? index * 3;
      const end =
        line.endTime !== null && line.endTime > start ? line.endTime : start + 2.5;
      return (
        String(index + 1) +
        '\n' +
        formatSrtTimestamp(start) +
        ' --> ' +
        formatSrtTimestamp(end) +
        '\n' +
        line.text
      );
    })
    .join('\n\n');
}

export function serializeProjectJson(project: KaraokeProject): string {
  const portable = {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    settings: project.settings,
    exportSettings: project.exportSettings,
    lyrics: project.lyrics,
    audioMetadata: project.audioMetadata ?? null,
  };
  return JSON.stringify(portable, null, 2);
}
`,

  'src/tests/lyricEngine.test.ts': String.raw`import { describe, it, expect } from 'vitest';
import {
  parseStandardLrc,
  parseEnhancedLrc,
  parseSrt,
  parsePlainText,
  serializeToLrc,
  serializeToEnhancedLrc,
  serializeToSrt,
} from '../features/lyric-parser/lyricParser';
import {
  findActiveLineIndex,
  computeWordProgress,
  validateLyricsTiming,
  convertLineTimingToWordTiming,
} from '../features/timing-engine/timingEngine';

describe('KaraokeForge Lyric Parser & Timing Engine Tests', () => {
  it('1. parses standard LRC correctly', () => {
    const lrc = '[00:05.50] Dòng đầu tiên\n[00:10.20] Dòng thứ hai';
    const lines = parseStandardLrc(lrc);
    expect(lines.length).toBe(2);
    expect(lines[0].startTime).toBe(5.5);
    expect(lines[0].text).toBe('Dòng đầu tiên');
    expect(lines[1].startTime).toBe(10.2);
  });

  it('2. parses enhanced word-level LRC correctly', () => {
    const elrc = '[00:01.00] <00:01.00>Xin <00:01.50>chào <00:02.00>bạn';
    const lines = parseEnhancedLrc(elrc);
    expect(lines.length).toBe(1);
    expect(lines[0].words.length).toBe(3);
    expect(lines[0].words[0].startTime).toBe(1.0);
    expect(lines[0].words[1].startTime).toBe(1.5);
  });

  it('3. parses SRT subtitles correctly', () => {
    const srt = '1\n00:00:02,000 --> 00:00:05,500\nPhụ đề SRT tiếng Việt';
    const lines = parseSrt(srt);
    expect(lines.length).toBe(1);
    expect(lines[0].startTime).toBe(2.0);
    expect(lines[0].endTime).toBe(5.5);
    expect(lines[0].text).toBe('Phụ đề SRT tiếng Việt');
  });

  it('4. parses plain text correctly', () => {
    const txt = 'Câu một\nCâu hai';
    const lines = parsePlainText(txt);
    expect(lines.length).toBe(2);
    expect(lines[0].startTime).toBeNull();
    expect(lines[0].text).toBe('Câu một');
  });

  it('5. serializes LRC, Enhanced LRC, and SRT accurately', () => {
    const lines = parseStandardLrc('[00:02.00] Xin chào');
    expect(serializeToLrc(lines)).toContain('[00:02.00]Xin chào');
    expect(serializeToEnhancedLrc(lines)).toContain('<00:02.00>Xin');
    expect(serializeToSrt(lines)).toContain('00:00:02,000 -->');
  });

  it('6. finds active line index via binary search accurately', () => {
    const lines = [
      { id: '1', text: 'A', startTime: 2.0, endTime: 5.0, words: [] },
      { id: '2', text: 'B', startTime: 6.0, endTime: 9.0, words: [] },
    ];
    expect(findActiveLineIndex(lines, 3.5).activeIndex).toBe(0);
    const gap = findActiveLineIndex(lines, 5.5);
    expect(gap.activeIndex).toBe(-1);
    expect(gap.prevIndex).toBe(0);
    expect(gap.nextIndex).toBe(1);
  });

  it('7. computes word fill progress correctly', () => {
    const word = { id: 'w1', text: 'test', startTime: 2.0, endTime: 4.0 };
    expect(computeWordProgress(word, 1.0)).toBe(0);
    expect(computeWordProgress(word, 3.0)).toBe(0.5);
    expect(computeWordProgress(word, 5.0)).toBe(1);
  });

  it('8. validates negative, overlap, out-of-order, and null timestamps', () => {
    const lines = [
      { id: '1', text: 'Negative', startTime: -1.0, endTime: 2.0, words: [] },
      { id: '2', text: 'First', startTime: 8.0, endTime: 9.0, words: [] },
      { id: '3', text: 'Out of order', startTime: 6.0, endTime: 7.0, words: [] },
      { id: '4', text: 'Duplicate', startTime: 6.0, endTime: 8.0, words: [] },
      { id: '5', text: 'Null start', startTime: null, endTime: null, words: [] },
    ];
    const issues = validateLyricsTiming(lines, 10.0);
    expect(issues.some((i) => i.type === 'negative')).toBe(true);
    expect(issues.some((i) => i.type === 'out_of_order')).toBe(true);
    expect(issues.some((i) => i.type === 'overlap')).toBe(true);
  });

  it('9. converts line-only timing into proportional word-level timing', () => {
    const lines = [
      {
        id: '1',
        text: 'Hai bốn',
        startTime: 1.0,
        endTime: 3.0,
        words: [
          { id: 'w1', text: 'Hai', startTime: null, endTime: null },
          { id: 'w2', text: 'bốn', startTime: null, endTime: null },
        ],
      },
    ];
    const converted = convertLineTimingToWordTiming(lines);
    expect(converted[0].words[0].startTime).toBe(1.0);
    expect(converted[0].words[0].endTime).toBe(2.0);
    expect(converted[0].words[1].startTime).toBe(2.0);
    expect(converted[0].words[1].endTime).toBe(3.0);
  });
});
`,

  'src/hooks/useAudioEngine.ts': String.raw`import { useCallback, useEffect, useState } from 'react';
import { audioEngine, AudioDecodeError } from '../features/audio-engine/audioEngine';
import {
  applyLineTapTimestamp,
  applyWordTapTimestamp,
  findActiveLineIndex,
} from '../features/timing-engine/timingEngine';
import { useProjectStore } from '../store/useProjectStore';
import { TaskStatus } from '../types/project';

export function useAudioEngine() {
  const [decodeStatus, setDecodeStatus] = useState<TaskStatus>('idle');
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const setAudioData = useProjectStore((s) => s.setAudioData);
  const addToast = useProjectStore((s) => s.addToast);
  const language = useProjectStore((s) => s.language);

  const loadAudioFile = useCallback(
    async (file: File | Blob, explicitName?: string) => {
      setDecodeStatus('loading');
      setDecodeError(null);

      try {
        const { metadata, peaks } = await audioEngine.decodeAudioFile(file, explicitName);
        setAudioData(file, metadata, peaks);
        setDecodeStatus('success');

        addToast({
          type: 'success',
          title: language === 'vi' ? 'Đã tải âm thanh thành công' : 'Audio loaded successfully',
          description:
            metadata.fileName +
            ' (' +
            metadata.sampleRate +
            ' Hz, ' +
            metadata.numberOfChannels +
            'ch)',
        });
      } catch (err) {
        const message =
          err instanceof AudioDecodeError
            ? err.message
            : language === 'vi'
            ? 'Đã xảy ra lỗi không xác định khi giải mã âm thanh.'
            : 'Unexpected error while decoding audio file.';

        setDecodeStatus('error');
        setDecodeError(message);
        addToast({
          type: 'error',
          title: language === 'vi' ? 'Lỗi giải mã âm thanh' : 'Audio Decode Error',
          description: message,
        });
      }
    },
    [setAudioData, addToast, language]
  );

  const seekToCurrentLineStart = useCallback(() => {
    const { project, currentTime } = useProjectStore.getState();
    const { activeIndex, prevIndex } = findActiveLineIndex(project.lyrics, currentTime);
    if (activeIndex !== -1 && project.lyrics[activeIndex]?.startTime !== null) {
      audioEngine.seek(project.lyrics[activeIndex].startTime!);
      return;
    }
    if (prevIndex !== -1 && project.lyrics[prevIndex]?.startTime !== null) {
      audioEngine.seek(project.lyrics[prevIndex].startTime!);
      return;
    }
    audioEngine.seek(project.settings.trimStart || 0);
  }, []);

  const triggerTapSync = useCallback(() => {
    const state = useProjectStore.getState();
    const {
      project,
      syncMode,
      activeSyncLineIndex,
      activeSyncWordIndex,
      duration,
      isPlaying,
    } = state;

    if (project.lyrics.length === 0) return;

    if (!isPlaying) {
      void audioEngine.play();
    }

    const tapTime = audioEngine.getCurrentTime();

    if (syncMode === 'line') {
      const safeLineIdx = Math.max(0, Math.min(project.lyrics.length - 1, activeSyncLineIndex));
      const updated = applyLineTapTimestamp(project.lyrics, safeLineIdx, tapTime, duration);
      state.setLyricsWithHistory(updated);

      if (safeLineIdx + 1 < project.lyrics.length) {
        state.setActiveSyncLineIndex(safeLineIdx + 1);
      }
      state.setActiveSyncWordIndex(0);
    } else {
      const safeLineIdx = Math.max(0, Math.min(project.lyrics.length - 1, activeSyncLineIndex));
      const { updatedLines, nextLineIndex, nextWordIndex } = applyWordTapTimestamp(
        project.lyrics,
        safeLineIdx,
        activeSyncWordIndex,
        tapTime,
        duration
      );
      state.setLyricsWithHistory(updatedLines);
      state.setActiveSyncLineIndex(nextLineIndex);
      state.setActiveSyncWordIndex(nextWordIndex);
    }
  }, []);

  return {
    decodeStatus,
    decodeError,
    loadAudioFile,
    play: (fromTime?: number) => audioEngine.play(fromTime),
    pause: () => audioEngine.pause(),
    togglePlay: () => audioEngine.togglePlay(),
    seek: (time: number) => audioEngine.seek(time),
    seekRelative: (delta: number) => {
      const now = audioEngine.getCurrentTime();
      audioEngine.seek(now + delta);
    },
    seekToCurrentLineStart,
    triggerTapSync,
    setVolume: (vol: number, muted?: boolean) => audioEngine.setVolume(vol, muted),
    setPlaybackRate: (rate: 0.5 | 0.75 | 1) => audioEngine.setPlaybackRate(rate),
  };
}

export function useGlobalMediaShortcuts() {
  const { loadAudioFile, triggerTapSync } = useAudioEngine();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isEditingInput) return;

      const store = useProjectStore.getState();

      if (e.code === 'Space') {
        e.preventDefault();
        if (store.isTapSyncActive) {
          triggerTapSync();
        } else {
          void audioEngine.togglePlay();
        }
        return;
      }

      if (e.code === 'Enter') {
        e.preventDefault();
        const total = store.project.lyrics.length;
        if (total === 0) return;
        const delta = e.shiftKey ? -1 : 1;
        const nextIdx = Math.max(0, Math.min(total - 1, store.activeSyncLineIndex + delta));
        store.setActiveSyncLineIndex(nextIdx);
        store.setActiveSyncWordIndex(0);
        return;
      }

      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.shiftKey ? -5 : -1;
        audioEngine.seek(audioEngine.getCurrentTime() + delta);
        return;
      }

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        audioEngine.seek(audioEngine.getCurrentTime() + delta);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          store.redoLyrics();
        } else {
          store.undoLyrics();
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        store.setExportModalOpen(true);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name)) {
          e.preventDefault();
          void loadAudioFile(file);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [loadAudioFile, triggerTapSync]);
}
`,

  'src/components/timeline/WaveformCanvas.tsx': String.raw`import React, { useEffect, useRef, useState } from 'react';
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
`,

  'src/components/preview/PreviewPanel.tsx': String.raw`import React, { useCallback, useEffect, useRef } from 'react';
import { MonitorPlay, Camera, Maximize2 } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { audioEngine } from '../../features/audio-engine/audioEngine';
import { renderKaraokeFrame } from '../../features/renderer/karaokeRenderer';
import { backgroundAssetCache } from '../../features/renderer/backgroundAssetCache';
import { getCanvasDimensions } from '../../utils/constants';
import { t } from '../../utils/i18n';
import { formatTimeDisplay } from '../../utils/time';

export const PreviewPanel: React.FC = () => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const language = useProjectStore((s) => s.language);
  const project = useProjectStore((s) => s.project);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const currentTime = useProjectStore((s) => s.currentTime);
  const addToast = useProjectStore((s) => s.addToast);

  const dims = getCanvasDimensions(project.settings.aspectRatio, project.settings.resolution);

  const drawSingleFrame = useCallback(
    (timeToDraw: number, playingState: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (canvas.width !== dims.width || canvas.height !== dims.height) {
        canvas.width = dims.width;
        canvas.height = dims.height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      renderKaraokeFrame(ctx, {
        project,
        songTime: timeToDraw,
        width: dims.width,
        height: dims.height,
        isPlaying: playingState,
        isExporting: false,
      });
    },
    [project, dims.width, dims.height]
  );

  useEffect(() => {
    backgroundAssetCache.setOnAssetLoaded(() => {
      const now = audioEngine.getCurrentTime();
      drawSingleFrame(now, useProjectStore.getState().isPlaying);
    });
    return () => {
      backgroundAssetCache.setOnAssetLoaded(null);
    };
  }, [drawSingleFrame]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      drawSingleFrame(currentTime, false);
      return;
    }

    const renderLoop = () => {
      const masterSongTime = audioEngine.getCurrentTime();
      drawSingleFrame(masterSongTime, true);
      rafRef.current = requestAnimationFrame(renderLoop);
    };

    rafRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, currentTime, drawSingleFrame]);

  const handleSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        (project.name || 'karaoke-frame') + '-' + Math.round(currentTime * 1000) + 'ms.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addToast({
        type: 'success',
        title: language === 'vi' ? 'Đã chụp khung hình PNG' : 'Saved frame snapshot (PNG)',
      });
    }, 'image/png');
  };

  const handleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  };

  return (
    <main className="flex-1 bg-forge-bg flex flex-col min-w-0 overflow-hidden">
      <div className="h-9 px-4 border-b border-forge-border flex items-center justify-between text-xs text-forge-muted bg-forge-panel/60 shrink-0">
        <div className="flex items-center gap-2">
          <MonitorPlay className="w-3.5 h-3.5 text-forge-highlight" />
          <span className="font-medium text-forge-text">{t(language, 'previewTitle')}</span>
          <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-forge-surface border border-forge-border text-[10px] font-mono text-forge-muted">
            {project.settings.templateId}
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span>
            {project.settings.aspectRatio} • {dims.width}×{dims.height}
          </span>
          <span>{project.settings.fps} FPS</span>
          <span className="text-forge-highlight font-semibold">
            {formatTimeDisplay(currentTime)}
          </span>

          <div className="flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={handleSnapshot}
              className="p-1 rounded hover:bg-forge-surface text-forge-muted hover:text-white transition"
              title={language === 'vi' ? 'Chụp ảnh khung hình (PNG)' : 'Capture PNG Snapshot'}
              aria-label="Chụp ảnh khung hình"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFullscreen}
              className="p-1 rounded hover:bg-forge-surface text-forge-muted hover:text-white transition"
              title={language === 'vi' ? 'Toàn màn hình' : 'Toggle Fullscreen'}
              aria-label="Toàn màn hình"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={stageRef}
        className="flex-1 flex items-center justify-center p-4 sm:p-6 overflow-hidden relative bg-[#06080c]"
      >
        <div
          className="relative flex items-center justify-center max-w-full max-h-full shadow-2xl rounded-xl overflow-hidden border border-forge-border bg-black"
          style={{
            aspectRatio: dims.width + ' / ' + dims.height,
            height: dims.height >= dims.width ? '100%' : 'auto',
            width: dims.width > dims.height ? '100%' : 'auto',
          }}
        >
          <canvas
            ref={canvasRef}
            width={dims.width}
            height={dims.height}
            onClick={() => void audioEngine.togglePlay()}
            className="w-full h-full object-contain block cursor-pointer"
          />
        </div>
      </div>
    </main>
  );
};
`,

  'src/components/lyrics/LyricsAndStylePanel.tsx': String.raw`import React, { useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  Timer,
  Palette,
  LayoutTemplate,
  Undo2,
  Redo2,
  Upload,
  Download,
  Plus,
  Trash2,
  Scissors,
  Merge,
  GripVertical,
  AlertTriangle,
  Sparkles,
  Play,
  FastForward,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { KARAOKE_TEMPLATES } from '../../features/templates/presets';
import {
  parseLyricsAuto,
  serializeProjectJson,
  serializeToEnhancedLrc,
  serializeToLrc,
  serializeToSrt,
  tokenizeLineIntoWords,
} from '../../features/lyric-parser/lyricParser';
import {
  convertLineTimingToWordTiming,
  nudgeLineTiming,
  shiftLinesFromIndex,
  validateLyricsTiming,
} from '../../features/timing-engine/timingEngine';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { AVAILABLE_FONTS } from '../../utils/constants';
import { createId } from '../../utils/id';
import { t } from '../../utils/i18n';
import { formatTimeDisplay } from '../../utils/time';
import { AspectRatio, FpsPreset, LyricLine, ResolutionPreset } from '../../types/project';

function triggerTextDownload(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const LyricsAndStylePanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showBulkTextarea, setShowBulkTextarea] = useState(false);
  const [bulkTextValue, setBulkTextValue] = useState('');
  const [draggedLineIndex, setDraggedLineIndex] = useState<number | null>(null);
  const [shiftAfterMs, setShiftAfterMs] = useState<number>(200);

  const language = useProjectStore((s) => s.language);
  const rightTab = useProjectStore((s) => s.rightTab);
  const setRightTab = useProjectStore((s) => s.setRightTab);
  const project = useProjectStore((s) => s.project);
  const duration = useProjectStore((s) => s.duration);
  const currentTime = useProjectStore((s) => s.currentTime);

  const syncMode = useProjectStore((s) => s.syncMode);
  const setSyncMode = useProjectStore((s) => s.setSyncMode);
  const activeSyncLineIndex = useProjectStore((s) => s.activeSyncLineIndex);
  const setActiveSyncLineIndex = useProjectStore((s) => s.setActiveSyncLineIndex);
  const activeSyncWordIndex = useProjectStore((s) => s.activeSyncWordIndex);
  const setActiveSyncWordIndex = useProjectStore((s) => s.setActiveSyncWordIndex);
  const isTapSyncActive = useProjectStore((s) => s.isTapSyncActive);
  const setIsTapSyncActive = useProjectStore((s) => s.setIsTapSyncActive);

  const setLyricsWithHistory = useProjectStore((s) => s.setLyricsWithHistory);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const updateTextStyle = useProjectStore((s) => s.updateTextStyle);
  const applyTemplate = useProjectStore((s) => s.applyTemplate);
  const undoLyrics = useProjectStore((s) => s.undoLyrics);
  const redoLyrics = useProjectStore((s) => s.redoLyrics);
  const undoStack = useProjectStore((s) => s.undoStack);
  const redoStack = useProjectStore((s) => s.redoStack);
  const addToast = useProjectStore((s) => s.addToast);

  const { triggerTapSync, seek } = useAudioEngine();

  const validationIssues = useMemo(
    () => validateLyricsTiming(project.lyrics, duration),
    [project.lyrics, duration]
  );

  const handleImportFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const text = await file.text();
      const { format, lines } = parseLyricsAuto(text, file.name);
      if (lines.length === 0) {
        addToast({
          type: 'warning',
          title: language === 'vi' ? 'File lời trống' : 'Empty lyrics file',
          description: file.name,
        });
        return;
      }
      setLyricsWithHistory(lines);
      setActiveSyncLineIndex(0);
      setActiveSyncWordIndex(0);
      addToast({
        type: 'success',
        title:
          language === 'vi'
            ? 'Đã nhập ' + lines.length + ' dòng (' + format.toUpperCase() + ')'
            : 'Imported ' + lines.length + ' lines (' + format.toUpperCase() + ')',
        description: file.name,
      });
    } catch {
      addToast({
        type: 'error',
        title: language === 'vi' ? 'Không thể đọc file lời' : 'Failed to read lyrics file',
      });
    }
  };

  const handleApplyBulkText = () => {
    const { format, lines } = parseLyricsAuto(bulkTextValue);
    setLyricsWithHistory(lines);
    setActiveSyncLineIndex(0);
    setActiveSyncWordIndex(0);
    setShowBulkTextarea(false);
    addToast({
      type: 'success',
      title:
        language === 'vi'
          ? 'Đã cập nhật ' + lines.length + ' dòng lời (' + format.toUpperCase() + ')'
          : 'Updated ' + lines.length + ' lyric lines (' + format.toUpperCase() + ')',
    });
  };

  const handleLineTextChange = (index: number, newText: string) => {
    const next = project.lyrics.map((line, i) => {
      if (i !== index) return line;
      return {
        ...line,
        text: newText,
        words: tokenizeLineIntoWords(newText, line.startTime, line.endTime),
      };
    });
    setLyricsWithHistory(next);
  };

  const handleLineTimeChangeMs = (
    index: number,
    field: 'startTime' | 'endTime',
    msValue: string
  ) => {
    const parsedMs = msValue.trim() === '' ? null : Number(msValue);
    const seconds =
      parsedMs !== null && !Number.isNaN(parsedMs)
        ? Number((parsedMs / 1000).toFixed(3))
        : null;

    const next = project.lyrics.map((line, i) => {
      if (i !== index) return line;
      const updatedStart = field === 'startTime' ? seconds : line.startTime;
      const updatedEnd = field === 'endTime' ? seconds : line.endTime;
      return {
        ...line,
        startTime: updatedStart,
        endTime: updatedEnd,
        words: tokenizeLineIntoWords(line.text, updatedStart, updatedEnd),
      };
    });
    setLyricsWithHistory(next);
  };

  const handleToggleSinger = (index: number) => {
    const next = project.lyrics.map((line, i) =>
      i === index ? { ...line, singer: line.singer === 'B' ? ('A' as const) : ('B' as const) } : line
    );
    setLyricsWithHistory(next);
  };

  const handleAddLineBelow = (index: number) => {
    const refLine = project.lyrics[index];
    const newStart = refLine?.endTime ?? null;
    const newEnd = newStart !== null ? Number((newStart + 2.5).toFixed(3)) : null;
    const newLine: LyricLine = {
      id: createId('line'),
      text: 'Dòng lời mới',
      startTime: newStart,
      endTime: newEnd,
      words: tokenizeLineIntoWords('Dòng lời mới', newStart, newEnd),
      singer: refLine?.singer ?? 'A',
    };
    const next = [
      ...project.lyrics.slice(0, index + 1),
      newLine,
      ...project.lyrics.slice(index + 1),
    ];
    setLyricsWithHistory(next);
  };

  const handleDeleteLine = (index: number) => {
    const next = project.lyrics.filter((_, i) => i !== index);
    setLyricsWithHistory(next);
    if (activeSyncLineIndex >= next.length) {
      setActiveSyncLineIndex(Math.max(0, next.length - 1));
    }
  };

  const handleMergeWithNext = (index: number) => {
    if (index >= project.lyrics.length - 1) return;
    const first = project.lyrics[index];
    const second = project.lyrics[index + 1];
    const mergedText = (first.text + ' ' + second.text).trim();
    const mergedStart = first.startTime ?? second.startTime;
    const mergedEnd = second.endTime ?? first.endTime;

    const mergedLine: LyricLine = {
      id: first.id,
      text: mergedText,
      startTime: mergedStart,
      endTime: mergedEnd,
      words: tokenizeLineIntoWords(mergedText, mergedStart, mergedEnd),
      singer: first.singer,
    };

    const next = [
      ...project.lyrics.slice(0, index),
      mergedLine,
      ...project.lyrics.slice(index + 2),
    ];
    setLyricsWithHistory(next);
  };

  const handleSplitLine = (index: number) => {
    const line = project.lyrics[index];
    const tokens = line.text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) {
      addToast({
        type: 'warning',
        title:
          language === 'vi'
            ? 'Cần ít nhất 2 từ để tách dòng'
            : 'Need at least 2 words to split line',
      });
      return;
    }

    const midWord = Math.ceil(tokens.length / 2);
    const firstText = tokens.slice(0, midWord).join(' ');
    const secondText = tokens.slice(midWord).join(' ');

    let firstStart = line.startTime;
    let firstEnd: number | null = null;
    let secondStart: number | null = null;
    let secondEnd = line.endTime;

    if (line.startTime !== null && line.endTime !== null && line.endTime > line.startTime) {
      const midTime = Number(((line.startTime + line.endTime) / 2).toFixed(3));
      firstEnd = midTime;
      secondStart = midTime;
    }

    const lineA: LyricLine = {
      id: line.id,
      text: firstText,
      startTime: firstStart,
      endTime: firstEnd,
      words: tokenizeLineIntoWords(firstText, firstStart, firstEnd),
      singer: line.singer,
    };

    const lineB: LyricLine = {
      id: createId('line'),
      text: secondText,
      startTime: secondStart,
      endTime: secondEnd,
      words: tokenizeLineIntoWords(secondText, secondStart, secondEnd),
      singer: line.singer,
    };

    const next = [
      ...project.lyrics.slice(0, index),
      lineA,
      lineB,
      ...project.lyrics.slice(index + 1),
    ];
    setLyricsWithHistory(next);
  };

  const handleDropReorder = (targetIndex: number) => {
    if (draggedLineIndex === null || draggedLineIndex === targetIndex) return;
    const next = [...project.lyrics];
    const [moved] = next.splice(draggedLineIndex, 1);
    next.splice(targetIndex, 0, moved);
    setLyricsWithHistory(next);
    setDraggedLineIndex(null);
  };

  const handleWordTimeChangeMs = (
    lineIdx: number,
    wordIdx: number,
    field: 'startTime' | 'endTime',
    msStr: string
  ) => {
    const parsedMs = msStr.trim() === '' ? null : Number(msStr);
    const secs =
      parsedMs !== null && !Number.isNaN(parsedMs)
        ? Number((parsedMs / 1000).toFixed(3))
        : null;

    const next = project.lyrics.map((line, i) => {
      if (i !== lineIdx) return line;
      const updatedWords = line.words.map((w, wi) =>
        wi === wordIdx ? { ...w, [field]: secs } : w
      );
      return {
        ...line,
        words: updatedWords,
      };
    });
    setLyricsWithHistory(next);
  };

  const selectedSyncLine = project.lyrics[activeSyncLineIndex] || null;

  return (
    <aside className="w-full lg:w-80 xl:w-96 bg-forge-panel border-l border-forge-border flex flex-col shrink-0">
      <div className="grid grid-cols-4 border-b border-forge-border bg-forge-bg/40 p-1 gap-1">
        <button
          type="button"
          onClick={() => {
            setRightTab('lyrics');
            setIsTapSyncActive(false);
          }}
          className={
            'flex items-center justify-center gap-1 py-2 rounded text-[11px] font-medium transition ' +
            (rightTab === 'lyrics'
              ? 'bg-forge-surface text-white shadow-sm'
              : 'text-forge-muted hover:text-forge-text')
          }
        >
          <AlignLeft className="w-3.5 h-3.5" />
          <span className="truncate">{t(language, 'lyricsTab')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setRightTab('sync');
            setIsTapSyncActive(true);
          }}
          className={
            'flex items-center justify-center gap-1 py-2 rounded text-[11px] font-medium transition ' +
            (rightTab === 'sync'
              ? 'bg-forge-surface text-white shadow-sm'
              : 'text-forge-muted hover:text-forge-text')
          }
        >
          <Timer className="w-3.5 h-3.5" />
          <span className="truncate">{t(language, 'syncTab')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setRightTab('style');
            setIsTapSyncActive(false);
          }}
          className={
            'flex items-center justify-center gap-1 py-2 rounded text-[11px] font-medium transition ' +
            (rightTab === 'style'
              ? 'bg-forge-surface text-white shadow-sm'
              : 'text-forge-muted hover:text-forge-text')
          }
        >
          <Palette className="w-3.5 h-3.5" />
          <span className="truncate">{t(language, 'styleTab')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setRightTab('templates');
            setIsTapSyncActive(false);
          }}
          className={
            'flex items-center justify-center gap-1 py-2 rounded text-[11px] font-medium transition ' +
            (rightTab === 'templates'
              ? 'bg-forge-surface text-white shadow-sm'
              : 'text-forge-muted hover:text-forge-text')
          }
        >
          <LayoutTemplate className="w-3.5 h-3.5" />
          <span className="truncate">{t(language, 'templatesTab')}</span>
        </button>
      </div>

      <div className="px-4 py-2 border-b border-forge-border flex items-center justify-between text-xs bg-forge-surface/30">
        <div className="flex items-center gap-2">
          <span className="text-forge-muted">
            Dòng: <strong className="text-white">{project.lyrics.length}</strong>
          </span>
          {validationIssues.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Timing OK</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{validationIssues.length} cảnh báo</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={undoLyrics}
            disabled={undoStack.length === 0}
            className="p-1.5 rounded bg-forge-surface hover:bg-slate-800 disabled:opacity-40 border border-forge-border"
            title="Hoàn tác (Ctrl+Z)"
            aria-label={t(language, 'undo')}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={redoLyrics}
            disabled={redoStack.length === 0}
            className="p-1.5 rounded bg-forge-surface hover:bg-slate-800 disabled:opacity-40 border border-forge-border"
            title="Làm lại (Ctrl+Shift+Z)"
            aria-label={t(language, 'redo')}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {rightTab === 'lyrics' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.lrc,.elrc,.srt,.json"
                className="hidden"
                onChange={(e) => void handleImportFile(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-forge-surface hover:bg-slate-800 border border-forge-border text-xs font-medium text-white transition"
              >
                <Upload className="w-3.5 h-3.5 text-forge-highlight" />
                <span>Import (.lrc/.srt/.txt)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!showBulkTextarea) {
                    setBulkTextValue(project.lyrics.map((l) => l.text).join('\n'));
                  }
                  setShowBulkTextarea(!showBulkTextarea);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-forge-surface hover:bg-slate-800 border border-forge-border text-xs font-medium text-white transition"
              >
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>{showBulkTextarea ? 'Đóng nhập nhanh' : 'Nhập văn bản'}</span>
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-forge-surface/60 border border-forge-border flex items-center justify-between gap-1 text-[11px]">
              <span className="text-forge-muted flex items-center gap-1 font-medium">
                <Download className="w-3.5 h-3.5 text-forge-highlight" />
                <span>Xuất lời:</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    triggerTextDownload(
                      (project.name || 'lyrics') + '.lrc',
                      serializeToLrc(project.lyrics, project.settings.title, project.settings.artist)
                    )
                  }
                  className="px-2 py-0.5 rounded bg-forge-bg hover:bg-slate-800 border border-forge-border font-mono text-white"
                >
                  LRC
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerTextDownload(
                      (project.name || 'lyrics') + '.elrc',
                      serializeToEnhancedLrc(
                        project.lyrics,
                        project.settings.title,
                        project.settings.artist
                      )
                    )
                  }
                  className="px-2 py-0.5 rounded bg-forge-bg hover:bg-slate-800 border border-forge-border font-mono text-forge-highlight"
                >
                  ELRC
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerTextDownload(
                      (project.name || 'lyrics') + '.srt',
                      serializeToSrt(project.lyrics)
                    )
                  }
                  className="px-2 py-0.5 rounded bg-forge-bg hover:bg-slate-800 border border-forge-border font-mono text-white"
                >
                  SRT
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerTextDownload(
                      (project.name || 'project') + '.json',
                      serializeProjectJson(project),
                      'application/json;charset=utf-8'
                    )
                  }
                  className="px-2 py-0.5 rounded bg-forge-bg hover:bg-slate-800 border border-forge-border font-mono text-amber-300"
                >
                  JSON
                </button>
              </div>
            </div>

            {showBulkTextarea && (
              <div className="p-3 rounded-xl bg-forge-surface border border-forge-accent space-y-2">
                <p className="text-[11px] text-forge-muted">
                  Dán lời bài hát (Plain text, Standard LRC, Enhanced LRC hoặc SRT). Hệ thống sẽ tự nhận diện:
                </p>
                <textarea
                  rows={7}
                  value={bulkTextValue}
                  onChange={(e) => setBulkTextValue(e.target.value)}
                  placeholder="Mỗi câu một dòng hoặc dán nội dung [00:12.30]..."
                  className="w-full rounded-lg bg-forge-bg border border-forge-border p-2.5 text-xs font-mono text-white focus:outline-none focus:border-forge-accent"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBulkTextarea(false)}
                    className="px-2.5 py-1 rounded bg-forge-bg text-xs text-forge-muted"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyBulkText}
                    className="px-3 py-1 rounded bg-forge-accent hover:bg-forge-accentHover text-xs font-semibold text-white"
                  >
                    Áp dụng lời
                  </button>
                </div>
              </div>
            )}

            {validationIssues.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1 max-h-28 overflow-y-auto">
                {validationIssues.map((issue, idx) => (
                  <div
                    key={issue.lineId + '_' + idx}
                    className="text-[11px] text-amber-300 flex items-start gap-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                    <span>{language === 'vi' ? issue.messageVi : issue.messageEn}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {project.lyrics.map((line, index) => {
                const isCurrentSync = index === activeSyncLineIndex;
                const startMs =
                  line.startTime !== null ? Math.round(line.startTime * 1000).toString() : '';
                const endMs =
                  line.endTime !== null ? Math.round(line.endTime * 1000).toString() : '';

                return (
                  <div
                    key={line.id}
                    draggable
                    onDragStart={() => setDraggedLineIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropReorder(index)}
                    onClick={() => setActiveSyncLineIndex(index)}
                    className={
                      'p-2.5 rounded-xl border text-xs space-y-2 transition ' +
                      (isCurrentSync
                        ? 'bg-forge-surface border-forge-accent shadow-sm'
                        : 'bg-forge-surface/60 border-forge-border hover:border-slate-600')
                    }
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <GripVertical className="w-3.5 h-3.5 text-forge-muted cursor-grab" />
                        <span className="font-mono text-[11px] font-bold text-forge-highlight">
                          #{index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSinger(index);
                          }}
                          className={
                            'px-1.5 py-0.5 rounded text-[10px] font-bold border ' +
                            (line.singer === 'B'
                              ? 'bg-pink-500/20 border-pink-500/40 text-pink-300'
                              : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300')
                          }
                          title="Đổi Ca sĩ A / Ca sĩ B (Duet)"
                        >
                          Ca sĩ {line.singer || 'A'}
                        </button>
                        {line.startTime !== null && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              seek(line.startTime!);
                            }}
                            className="p-1 rounded hover:bg-forge-bg text-forge-muted hover:text-white"
                            title="Tua tới câu này"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSplitLine(index);
                          }}
                          className="p-1 rounded hover:bg-forge-bg text-forge-muted hover:text-white"
                          title="Tách đôi dòng (Split)"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMergeWithNext(index);
                          }}
                          disabled={index >= project.lyrics.length - 1}
                          className="p-1 rounded hover:bg-forge-bg text-forge-muted hover:text-white disabled:opacity-30"
                          title="Gộp với dòng kế tiếp (Merge)"
                        >
                          <Merge className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddLineBelow(index);
                          }}
                          className="p-1 rounded hover:bg-forge-bg text-forge-muted hover:text-emerald-400"
                          title="Thêm dòng bên dưới"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLine(index);
                          }}
                          className="p-1 rounded hover:bg-forge-bg text-forge-muted hover:text-rose-400"
                          title="Xóa dòng"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={line.text}
                      onChange={(e) => handleLineTextChange(index, e.target.value)}
                      className="w-full bg-forge-bg/80 border border-forge-border focus:border-forge-accent rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                    />

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <label className="flex items-center gap-1 text-forge-muted">
                        <span>Start(ms):</span>
                        <input
                          type="number"
                          step={50}
                          value={startMs}
                          placeholder="--"
                          onChange={(e) =>
                            handleLineTimeChangeMs(index, 'startTime', e.target.value)
                          }
                          className="w-full bg-forge-bg border border-forge-border rounded px-1.5 py-0.5 text-white"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-forge-muted">
                        <span>End(ms):</span>
                        <input
                          type="number"
                          step={50}
                          value={endMs}
                          placeholder="--"
                          onChange={(e) =>
                            handleLineTimeChangeMs(index, 'endTime', e.target.value)
                          }
                          className="w-full bg-forge-bg border border-forge-border rounded px-1.5 py-0.5 text-white"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {rightTab === 'sync' && (
          <div className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-forge-bg rounded-xl border border-forge-border">
              <button
                type="button"
                onClick={() => {
                  setSyncMode('line');
                  setActiveSyncWordIndex(0);
                }}
                className={
                  'py-2 rounded-lg font-semibold transition ' +
                  (syncMode === 'line'
                    ? 'bg-forge-accent text-white shadow'
                    : 'text-forge-muted hover:text-white')
                }
              >
                {t(language, 'lineSyncMode')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSyncMode('word');
                  setActiveSyncWordIndex(0);
                }}
                className={
                  'py-2 rounded-lg font-semibold transition ' +
                  (syncMode === 'word'
                    ? 'bg-forge-accent text-white shadow'
                    : 'text-forge-muted hover:text-white')
                }
              >
                {t(language, 'wordSyncMode')}
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-white">
                  <input
                    type="checkbox"
                    checked={isTapSyncActive}
                    onChange={(e) => setIsTapSyncActive(e.target.checked)}
                    className="accent-forge-accent"
                  />
                  <span>Dùng phím Space để Tap nhịp</span>
                </label>
                <span className="font-mono text-[11px] text-forge-highlight">
                  {formatTimeDisplay(currentTime)}
                </span>
              </div>

              <button
                type="button"
                onClick={triggerTapSync}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-forge-accent to-cyan-500 hover:opacity-95 text-white font-bold text-sm shadow-lg active:scale-[0.99] transition flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {syncMode === 'line'
                    ? 'TAP DÒNG #' + (activeSyncLineIndex + 1) + ' (SPACE)'
                    : 'TAP TỪ #' +
                      (activeSyncWordIndex + 1) +
                      ' — DÒNG #' +
                      (activeSyncLineIndex + 1)}
                </span>
              </button>

              {selectedSyncLine && (
                <div className="p-2.5 rounded-lg bg-forge-bg border border-forge-border space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-forge-muted font-mono">
                    <span>Dòng đang chọn: #{activeSyncLineIndex + 1}</span>
                    <span>
                      {formatTimeDisplay(selectedSyncLine.startTime)} →{' '}
                      {formatTimeDisplay(selectedSyncLine.endTime)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedSyncLine.words.map((word, wIdx) => {
                      const isCurrentWord = syncMode === 'word' && wIdx === activeSyncWordIndex;
                      const isTimed = word.startTime !== null;
                      return (
                        <button
                          key={word.id}
                          type="button"
                          onClick={() => setActiveSyncWordIndex(wIdx)}
                          className={
                            'px-2 py-1 rounded text-xs font-medium border transition ' +
                            (isCurrentWord
                              ? 'bg-forge-highlight text-slate-950 border-forge-highlight font-bold'
                              : isTimed
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-forge-surface border-forge-border text-forge-text')
                          }
                        >
                          {word.text}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-2.5">
              <div className="font-semibold text-white">
                Tinh chỉnh nhanh dòng #{activeSyncLineIndex + 1} (Nudge)
              </div>
              <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px]">
                {[-0.5, -0.1, -0.05, -0.01, 0.01, 0.05, 0.1, 0.5].map((secDelta) => {
                  const msLabel =
                    (secDelta > 0 ? '+' : '') + Math.round(secDelta * 1000) + 'ms';
                  return (
                    <button
                      key={msLabel}
                      type="button"
                      onClick={() =>
                        setLyricsWithHistory(
                          nudgeLineTiming(project.lyrics, activeSyncLineIndex, secDelta)
                        )
                      }
                      className="py-1.5 rounded bg-forge-bg hover:bg-slate-800 border border-forge-border text-forge-text hover:text-white transition"
                    >
                      {msLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-2.5">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <FastForward className="w-3.5 h-3.5 text-amber-400" />
                <span>Shift all after line #{activeSyncLineIndex + 1}</span>
              </div>
              <p className="text-[11px] text-forge-muted">
                Dịch đồng loạt từ dòng #{activeSyncLineIndex + 1} đến hết bài khi phát hiện lệch nhịp:
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={50}
                  value={shiftAfterMs}
                  onChange={(e) => setShiftAfterMs(Number(e.target.value) || 0)}
                  className="w-28 bg-forge-bg border border-forge-border rounded px-2 py-1.5 font-mono text-xs text-white"
                />
                <span className="text-forge-muted font-mono">ms</span>
                <button
                  type="button"
                  onClick={() => {
                    const updated = shiftLinesFromIndex(
                      project.lyrics,
                      activeSyncLineIndex,
                      shiftAfterMs / 1000
                    );
                    setLyricsWithHistory(updated);
                    addToast({
                      type: 'info',
                      title:
                        'Đã dịch ' +
                        shiftAfterMs +
                        'ms từ dòng #' +
                        (activeSyncLineIndex + 1),
                    });
                  }}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-forge-accent hover:bg-forge-accentHover text-white font-semibold transition"
                >
                  Áp dụng
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Word-level Timestamps</span>
                <button
                  type="button"
                  onClick={() => {
                    setLyricsWithHistory(convertLineTimingToWordTiming(project.lyrics));
                    addToast({
                      type: 'success',
                      title: 'Đã phân bổ thời gian từng từ theo số ký tự',
                    });
                  }}
                  className="text-[11px] text-forge-highlight hover:underline"
                >
                  Tự chia từ Line timing
                </button>
              </div>

              {selectedSyncLine && (
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {selectedSyncLine.words.map((word, wIdx) => (
                    <div
                      key={word.id}
                      className="grid grid-cols-12 items-center gap-1.5 text-[11px] font-mono bg-forge-bg p-1.5 rounded border border-forge-border"
                    >
                      <span className="col-span-4 font-sans font-medium text-white truncate">
                        {word.text}
                      </span>
                      <input
                        type="number"
                        step={20}
                        placeholder="Start ms"
                        value={
                          word.startTime !== null ? Math.round(word.startTime * 1000) : ''
                        }
                        onChange={(e) =>
                          handleWordTimeChangeMs(
                            activeSyncLineIndex,
                            wIdx,
                            'startTime',
                            e.target.value
                          )
                        }
                        className="col-span-4 bg-forge-surface border border-forge-border rounded px-1.5 py-0.5 text-white"
                      />
                      <input
                        type="number"
                        step={20}
                        placeholder="End ms"
                        value={word.endTime !== null ? Math.round(word.endTime * 1000) : ''}
                        onChange={(e) =>
                          handleWordTimeChangeMs(
                            activeSyncLineIndex,
                            wIdx,
                            'endTime',
                            e.target.value
                          )
                        }
                        className="col-span-4 bg-forge-surface border border-forge-border rounded px-1.5 py-0.5 text-white"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {rightTab === 'style' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-3">
              <div className="font-semibold text-white">Khung hình & Độ phân giải</div>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Tỉ lệ</span>
                  <select
                    value={project.settings.aspectRatio}
                    onChange={(e) =>
                      updateSettings({ aspectRatio: e.target.value as AspectRatio })
                    }
                    className="w-full bg-forge-bg border border-forge-border rounded px-2 py-1.5 text-white"
                  >
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="1:1">1:1</option>
                    <option value="4:5">4:5</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Độ phân giải</span>
                  <select
                    value={project.settings.resolution}
                    onChange={(e) =>
                      updateSettings({ resolution: e.target.value as ResolutionPreset })
                    }
                    className="w-full bg-forge-bg border border-forge-border rounded px-2 py-1.5 text-white"
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                    <option value="4K">4K</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">FPS</span>
                  <select
                    value={project.settings.fps}
                    onChange={(e) =>
                      updateSettings({ fps: Number(e.target.value) as FpsPreset })
                    }
                    className="w-full bg-forge-bg border border-forge-border rounded px-2 py-1.5 text-white"
                  >
                    <option value={24}>24 FPS</option>
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-3">
              <div className="font-semibold text-white">Kiểu chữ (Typography)</div>
              <label className="block space-y-1">
                <span className="text-[11px] text-forge-muted">Font Family</span>
                <select
                  value={project.settings.textStyle.fontFamily}
                  onChange={(e) => updateTextStyle({ fontFamily: e.target.value })}
                  className="w-full bg-forge-bg border border-forge-border rounded px-2.5 py-1.5 text-white"
                >
                  {AVAILABLE_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">
                    Cỡ chữ ({project.settings.textStyle.fontSize}px)
                  </span>
                  <input
                    type="range"
                    min={28}
                    max={96}
                    value={project.settings.textStyle.fontSize}
                    onChange={(e) => updateTextStyle({ fontSize: Number(e.target.value) })}
                    className="w-full accent-forge-accent"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">
                    Độ dày viền ({project.settings.textStyle.strokeWidth}px)
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={14}
                    value={project.settings.textStyle.strokeWidth}
                    onChange={(e) => updateTextStyle({ strokeWidth: Number(e.target.value) })}
                    className="w-full accent-forge-accent"
                  />
                </label>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-3">
              <div className="font-semibold text-white">Màu sắc Karaoke</div>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Màu chữ gốc</span>
                  <input
                    type="color"
                    value={project.settings.textStyle.color}
                    onChange={(e) => updateTextStyle({ color: e.target.value })}
                    className="w-full h-8 rounded bg-forge-bg border border-forge-border cursor-pointer"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Màu tô chữ (Ca sĩ A)</span>
                  <input
                    type="color"
                    value={project.settings.textStyle.highlightColor}
                    onChange={(e) => updateTextStyle({ highlightColor: e.target.value })}
                    className="w-full h-8 rounded bg-forge-bg border border-forge-border cursor-pointer"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Màu tô chữ (Ca sĩ B)</span>
                  <input
                    type="color"
                    value={project.settings.textStyle.secondarySingerColor || '#f472b6'}
                    onChange={(e) => updateTextStyle({ secondarySingerColor: e.target.value })}
                    className="w-full h-8 rounded bg-forge-bg border border-forge-border cursor-pointer"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Màu viền chữ (Stroke)</span>
                  <input
                    type="color"
                    value={project.settings.textStyle.strokeColor}
                    onChange={(e) => updateTextStyle({ strokeColor: e.target.value })}
                    className="w-full h-8 rounded bg-forge-bg border border-forge-border cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-3">
              <div className="font-semibold text-white">Vị trí, Animation & Lớp phủ</div>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Vị trí dọc</span>
                  <select
                    value={project.settings.textStyle.verticalPosition}
                    onChange={(e) =>
                      updateTextStyle({
                        verticalPosition: e.target.value as 'top' | 'center' | 'bottom',
                      })
                    }
                    className="w-full bg-forge-bg border border-forge-border rounded px-2 py-1.5 text-white"
                  >
                    <option value="top">Trên (Top)</option>
                    <option value="center">Giữa (Center)</option>
                    <option value="bottom">Dưới (Bottom)</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Căn lề</span>
                  <select
                    value={project.settings.textStyle.align}
                    onChange={(e) =>
                      updateTextStyle({
                        align: e.target.value as 'left' | 'center' | 'right',
                      })
                    }
                    className="w-full bg-forge-bg border border-forge-border rounded px-2 py-1.5 text-white"
                  >
                    <option value="left">Trái</option>
                    <option value="center">Giữa</option>
                    <option value="right">Phải</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Animation</span>
                  <select
                    value={project.settings.textStyle.animation}
                    onChange={(e) =>
                      updateTextStyle({
                        animation: e.target.value as
                          | 'none'
                          | 'fade'
                          | 'slide'
                          | 'scale'
                          | 'typewriter',
                      })
                    }
                    className="w-full bg-forge-bg border border-forge-border rounded px-2 py-1.5 text-white"
                  >
                    <option value="none">Không</option>
                    <option value="fade">Fade</option>
                    <option value="slide">Slide</option>
                    <option value="scale">Scale</option>
                    <option value="typewriter">Typewriter</option>
                  </select>
                </label>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-forge-muted">Phát sáng Neon (Glow)</span>
                  <input
                    type="checkbox"
                    checked={project.settings.textStyle.glow}
                    onChange={(e) => updateTextStyle({ glow: e.target.checked })}
                    className="accent-forge-accent"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-forge-muted">Đổ bóng chữ (Drop Shadow)</span>
                  <input
                    type="checkbox"
                    checked={project.settings.textStyle.shadow}
                    onChange={(e) => updateTextStyle({ shadow: e.target.checked })}
                    className="accent-forge-accent"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-forge-muted">Hiện tiêu đề bài hát mở đầu (Intro)</span>
                  <input
                    type="checkbox"
                    checked={project.settings.textStyle.showIntroTitle !== false}
                    onChange={(e) => updateTextStyle({ showIntroTitle: e.target.checked })}
                    className="accent-forge-accent"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-forge-muted">Đếm ngược 3-2-1 trước câu hát</span>
                  <input
                    type="checkbox"
                    checked={project.settings.textStyle.showCountdown !== false}
                    onChange={(e) => updateTextStyle({ showCountdown: e.target.checked })}
                    className="accent-forge-accent"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-forge-muted">Khung an toàn TikTok/Reels (Safe Area)</span>
                  <input
                    type="checkbox"
                    checked={Boolean(project.settings.textStyle.safeAreaOverlay)}
                    onChange={(e) => updateTextStyle({ safeAreaOverlay: e.target.checked })}
                    className="accent-forge-accent"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-forge-muted">Hiện Watermark / Tên kênh tùy chọn</span>
                  <input
                    type="checkbox"
                    checked={Boolean(project.settings.textStyle.showWatermark)}
                    onChange={(e) => updateTextStyle({ showWatermark: e.target.checked })}
                    className="accent-forge-accent"
                  />
                </label>
                {project.settings.textStyle.showWatermark && (
                  <input
                    type="text"
                    value={project.settings.textStyle.watermarkText || ''}
                    onChange={(e) => updateTextStyle({ watermarkText: e.target.value })}
                    placeholder="Nhập tên kênh hoặc watermark..."
                    className="w-full bg-forge-bg border border-forge-border rounded px-2.5 py-1.5 text-xs text-white"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {rightTab === 'templates' && (
          <div className="space-y-2.5">
            {KARAOKE_TEMPLATES.map((tpl) => {
              const isSelected = project.settings.templateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className={
                    'w-full text-left p-3 rounded-xl border transition ' +
                    (isSelected
                      ? 'bg-forge-accent/15 border-forge-accent text-white'
                      : 'bg-forge-surface border-forge-border text-forge-text hover:border-slate-500')
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      {language === 'vi' ? tpl.nameVi : tpl.nameEn}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-forge-bg text-forge-highlight">
                      {tpl.aspectRatio}
                    </span>
                  </div>
                  <p className="text-[11px] text-forge-muted mt-1">
                    {language === 'vi' ? tpl.descriptionVi : tpl.descriptionEn}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
`,

  'src/components/export/ExportModal.tsx': String.raw`import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Film,
  Download,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Ban,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { BITRATE_PRESETS, getCanvasDimensions } from '../../utils/constants';
import { formatBytes, formatTimeDisplay } from '../../utils/time';
import { checkResolutionSupported } from '../../features/export-pipeline/capabilities';
import {
  ExportCancelledError,
  exportKaraokeVideo,
  ExportProgressInfo,
  ExportResult,
} from '../../features/export-pipeline/exportPipeline';
import { AspectRatio, FpsPreset, ResolutionPreset, TaskStatus } from '../../types/project';

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const ExportModal: React.FC = () => {
  const isOpen = useProjectStore((s) => s.isExportModalOpen);
  const setOpen = useProjectStore((s) => s.setExportModalOpen);
  const project = useProjectStore((s) => s.project);
  const duration = useProjectStore((s) => s.duration);
  const language = useProjectStore((s) => s.language);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const updateExportSettings = useProjectStore((s) => s.updateExportSettings);
  const addToast = useProjectStore((s) => s.addToast);

  const [status, setStatus] = useState<TaskStatus>('idle');
  const [progress, setProgress] = useState<ExportProgressInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ExportResult | null>(null);
  const [is4KSupported, setIs4KSupported] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void checkResolutionSupported(3840, 2160, project.exportSettings.fps).then((ok) => {
      if (active) setIs4KSupported(ok);
    });
    return () => {
      active = false;
    };
  }, [isOpen, project.exportSettings.fps]);

  if (!isOpen) return null;

  const dims = getCanvasDimensions(project.settings.aspectRatio, project.settings.resolution);
  const trimStart = project.settings.trimStart || 0;
  const trimEnd =
    project.settings.trimEnd !== null && project.settings.trimEnd > trimStart
      ? project.settings.trimEnd
      : duration;
  const exportDuration = Math.max(0.5, trimEnd - trimStart);
  const totalFrames = Math.ceil(exportDuration * project.exportSettings.fps);
  const isEncoding = status === 'loading' || status === 'processing';

  const handleBitratePresetChange = (preset: 'low' | 'medium' | 'high' | 'custom') => {
    if (preset === 'custom') {
      updateExportSettings({ bitratePreset: 'custom' });
      return;
    }
    const config = BITRATE_PRESETS[preset];
    updateExportSettings({
      bitratePreset: preset,
      videoBitrate: config.videoBitrate,
      audioBitrate: config.audioBitrate,
    });
  };

  const handleStartExport = async () => {
    setStatus('processing');
    setErrorMsg(null);
    setLastResult(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await exportKaraokeVideo(
        project,
        language,
        (info) => {
          setProgress(info);
        },
        controller.signal
      );

      setLastResult(result);
      setStatus('success');
      triggerBlobDownload(result.blob, result.filename);

      addToast({
        type: 'success',
        title:
          language === 'vi'
            ? 'Xuất video ' + result.container.toUpperCase() + ' thành công!'
            : 'Exported ' + result.container.toUpperCase() + ' video successfully!',
        description: result.filename + ' (' + formatBytes(result.blob.size) + ')',
      });
    } catch (err) {
      if (err instanceof ExportCancelledError) {
        setStatus('cancelled');
        addToast({
          type: 'warning',
          title: language === 'vi' ? 'Đã hủy xuất video' : 'Video export cancelled',
          description:
            language === 'vi'
              ? 'Bộ mã hóa đã dừng và giải phóng bộ nhớ an toàn.'
              : 'Encoders stopped and memory released safely.',
        });
        return;
      }

      const msg =
        err instanceof Error
          ? err.message
          : language === 'vi'
          ? 'Đã xảy ra lỗi trong quá trình kết xuất video.'
          : 'An error occurred during video export.';

      setErrorMsg(msg);
      setStatus('error');
      addToast({
        type: 'error',
        title: language === 'vi' ? 'Xuất video thất bại' : 'Video export failed',
        description: msg,
      });
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleCloseModal = () => {
    if (isEncoding) {
      handleCancelExport();
    }
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="bg-forge-panel border border-forge-border rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-forge-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-forge-accent/15 border border-forge-accent/40 flex items-center justify-center">
              <Film className="w-5 h-5 text-forge-highlight" />
            </div>
            <div>
              <h2 id="export-modal-title" className="text-base font-bold text-white">
                {language === 'vi' ? 'Xuất Video Karaoke' : 'Export Karaoke Video'}
              </h2>
              <p className="text-[11px] text-forge-muted">
                WebCodecs Hardware H.264/AAC MP4 • WebM Fallback • Local-First
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            className="text-forge-muted hover:text-white p-1.5 rounded-lg hover:bg-forge-surface"
            aria-label="Đóng hộp thoại xuất video"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-forge-surface/70 border border-forge-border text-xs">
          <div>
            <span className="text-[11px] text-forge-muted block">Kích thước khung</span>
            <strong className="font-mono text-white">
              {dims.width}×{dims.height} ({project.settings.aspectRatio})
            </strong>
          </div>
          <div>
            <span className="text-[11px] text-forge-muted block">Thời lượng xuất</span>
            <strong className="font-mono text-forge-highlight">
              {formatTimeDisplay(exportDuration, false)} ({totalFrames} frames)
            </strong>
          </div>
          <div>
            <span className="text-[11px] text-forge-muted block">Âm thanh</span>
            <strong className="font-mono text-white truncate block">
              {project.audioMetadata ? project.audioMetadata.fileName : 'Im lặng (Chưa tải nhạc)'}
            </strong>
          </div>
        </div>

        <div className={'space-y-4 text-xs ' + (isEncoding ? 'opacity-50 pointer-events-none' : '')}>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-forge-muted font-medium">Định dạng Container</span>
              <select
                value={project.exportSettings.format}
                onChange={(e) =>
                  updateExportSettings({ format: e.target.value as 'mp4' | 'webm' })
                }
                className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-white font-medium"
              >
                <option value="mp4">MP4 (H.264 + AAC) — Khuyên dùng</option>
                <option value="webm">WebM (VP9 + Opus)</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-forge-muted font-medium">Tốc độ khung hình (FPS)</span>
              <select
                value={project.exportSettings.fps}
                onChange={(e) => {
                  const fps = Number(e.target.value) as FpsPreset;
                  updateExportSettings({ fps });
                  updateSettings({ fps });
                }}
                className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-white font-mono"
              >
                <option value={24}>24 FPS (Cinematic)</option>
                <option value={30}>30 FPS (Chuẩn mạng xã hội)</option>
                <option value={60}>60 FPS (Siêu mượt)</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-forge-muted font-medium">Tỉ lệ khung hình</span>
              <select
                value={project.settings.aspectRatio}
                onChange={(e) =>
                  updateSettings({ aspectRatio: e.target.value as AspectRatio })
                }
                className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-white font-mono"
              >
                <option value="16:9">16:9 (YouTube / TV Ngang)</option>
                <option value="9:16">9:16 (TikTok / Reels / Shorts)</option>
                <option value="1:1">1:1 (Vuông Instagram)</option>
                <option value="4:5">4:5 (Chân dung Feed)</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-forge-muted font-medium">Độ phân giải</span>
              <select
                value={project.settings.resolution}
                onChange={(e) =>
                  updateSettings({ resolution: e.target.value as ResolutionPreset })
                }
                className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-white font-mono"
              >
                <option value="720p">720p HD (Nhanh & Nhẹ)</option>
                <option value="1080p">1080p Full HD (Chuẩn)</option>
                <option value="4K" disabled={!is4KSupported}>
                  4K Ultra HD {!is4KSupported ? '(Thiết bị không hỗ trợ)' : ''}
                </option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-forge-muted font-medium block">Chất lượng Bitrate</span>
            <div className="grid grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'custom'] as const).map((presetKey) => {
                const isSelected = (project.exportSettings.bitratePreset || 'medium') === presetKey;
                const labels = {
                  low: 'Thấp (2.5M)',
                  medium: 'Chuẩn (5M)',
                  high: 'Cao (8M)',
                  custom: 'Tùy chỉnh',
                };
                return (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => handleBitratePresetChange(presetKey)}
                    className={
                      'py-2 px-2.5 rounded-lg border text-xs font-semibold transition ' +
                      (isSelected
                        ? 'bg-forge-accent/20 border-forge-accent text-white'
                        : 'bg-forge-surface border-forge-border text-forge-muted hover:text-white')
                    }
                  >
                    {labels[presetKey]}
                  </button>
                );
              })}
            </div>

            {project.exportSettings.bitratePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Video Bitrate (kbps)</span>
                  <input
                    type="number"
                    min={500}
                    max={35000}
                    step={500}
                    value={Math.round(project.exportSettings.videoBitrate / 1000)}
                    onChange={(e) =>
                      updateExportSettings({
                        videoBitrate: Math.max(500_000, Number(e.target.value) * 1000),
                      })
                    }
                    className="w-full bg-forge-surface border border-forge-border rounded px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Audio Bitrate (kbps)</span>
                  <input
                    type="number"
                    min={64}
                    max={320}
                    step={32}
                    value={Math.round(project.exportSettings.audioBitrate / 1000)}
                    onChange={(e) =>
                      updateExportSettings({
                        audioBitrate: Math.max(64_000, Number(e.target.value) * 1000),
                      })
                    }
                    className="w-full bg-forge-surface border border-forge-border rounded px-2.5 py-1.5 font-mono text-white"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {progress?.fallbackNotice && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div>{progress.fallbackNotice}</div>
          </div>
        )}

        {(isEncoding || status === 'success' || status === 'cancelled') && progress && (
          <div className="p-4 rounded-xl bg-forge-surface border border-forge-border space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-semibold text-white">
                {isEncoding && <Loader2 className="w-4 h-4 text-forge-highlight animate-spin" />}
                {status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                <span>
                  {progress.phase === 'probing' && 'Đang kiểm tra bộ mã hóa phần cứng...'}
                  {progress.phase === 'encoding-video' && 'Đang kết xuất & mã hóa khung hình...'}
                  {progress.phase === 'encoding-audio' && 'Đang mã hóa và đồng bộ âm thanh...'}
                  {progress.phase === 'muxing' && 'Đang đóng gói container MP4/WebM...'}
                  {progress.phase === 'completed' && 'Hoàn tất xuất video!'}
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-forge-highlight">
                {progress.percent}%
              </span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-forge-bg overflow-hidden border border-forge-border">
              <div
                className="h-full bg-gradient-to-r from-forge-accent to-forge-highlight transition-all duration-150"
                style={{ width: progress.percent + '%' }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-forge-muted">
              <span>
                Frame: {progress.encodedFrames} / {progress.totalFrames}
              </span>
              <span>Engine: {progress.activeEngine}</span>
              <span>
                ETA: {progress.etaSeconds !== null ? progress.etaSeconds + 's' : '--'}
              </span>
            </div>
          </div>
        )}

        {status === 'error' && errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1">
              <p className="font-semibold text-rose-200">Xuất video không thành công</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {status === 'success' && lastResult && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="font-semibold text-emerald-300 truncate">{lastResult.filename}</p>
              <p className="text-[11px] text-forge-muted font-mono mt-0.5">
                Dung lượng: {formatBytes(lastResult.blob.size)} • Định dạng:{' '}
                {lastResult.container.toUpperCase()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => triggerBlobDownload(lastResult.blob, lastResult.filename)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1.5 shrink-0 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải lại file</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-forge-border">
          <div className="flex items-center gap-1.5 text-[11px] text-forge-muted">
            <Sparkles className="w-3.5 h-3.5 text-forge-highlight" />
            <span>Không chèn watermark bắt buộc • Xử lý 100% trên trình duyệt</span>
          </div>

          <div className="flex items-center gap-2">
            {isEncoding ? (
              <button
                type="button"
                onClick={handleCancelExport}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white flex items-center gap-1.5 shadow transition"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Hủy xuất (Cancel)</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl bg-forge-surface hover:bg-slate-800 text-xs font-medium text-forge-text border border-forge-border transition"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => void handleStartExport()}
                  className="px-5 py-2 rounded-xl bg-forge-accent hover:bg-forge-accentHover text-xs font-bold text-white flex items-center gap-1.5 shadow-lg transition"
                >
                  {status === 'error' || status === 'cancelled' ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Thử lại (Retry)</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Bắt đầu xuất Video</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
`,
};

for (const [relativePath, content] of Object.entries(files)) {
  const fullPath = path.resolve(process.cwd(), relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('✔ Đã cập nhật thành công:', relativePath);
}

console.log('\n🎉 Hoàn tất! Hãy chạy: npm run test hoặc npm run dev');