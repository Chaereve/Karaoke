import { describe, it, expect } from 'vitest';
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
