import { KaraokeProject, LyricLine, LyricWord } from '../../types/project';
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
