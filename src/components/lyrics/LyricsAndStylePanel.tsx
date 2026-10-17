import React, { useMemo, useRef, useState } from 'react';
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
