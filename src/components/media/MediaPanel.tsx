import React, { useRef, useState } from 'react';
import {
  Music,
  Image as ImageIcon,
  FolderKanban,
  UploadCloud,
  Scissors,
  Volume2,
  VolumeX,
  Loader2,
  AlertCircle,
  Sparkles,
  Film,
  FilePlus2,
  Copy,
  Trash2,
  FolderOpen,
  FileJson,
  Download,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useProjectPersistence } from '../../hooks/useProjectPersistence';
import { parseAndValidateProjectJson } from '../../features/project-storage/projectValidator';
import { serializeProjectJson } from '../../features/lyric-parser/lyricParser';
import { saveProjectToDb } from '../../features/project-storage/projectStorage';
import { t } from '../../utils/i18n';
import { formatBytes, formatTimeDisplay } from '../../utils/time';

export const MediaPanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonProjectInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const language = useProjectStore((s) => s.language);
  const leftTab = useProjectStore((s) => s.leftTab);
  const setLeftTab = useProjectStore((s) => s.setLeftTab);
  const project = useProjectStore((s) => s.project);
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const duration = useProjectStore((s) => s.duration);
  const currentTime = useProjectStore((s) => s.currentTime);
  const updateProjectName = useProjectStore((s) => s.updateProjectName);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const updateBackground = useProjectStore((s) => s.updateBackground);
  const setBackgroundAsset = useProjectStore((s) => s.setBackgroundAsset);
  const setProject = useProjectStore((s) => s.setProject);
  const addToast = useProjectStore((s) => s.addToast);

  const { decodeStatus, decodeError, loadAudioFile, setVolume } = useAudioEngine();
  const {
    createNewAndSave,
    openProjectById,
    duplicateProjectById,
    deleteProjectById,
    refreshProjectList,
  } = useProjectPersistence();

  const handleAudioSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void loadAudioFile(files[0]);
  };

  const handleBackgroundAssetSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);

    if (!isVideo && !isImage) {
      addToast({
        type: 'error',
        title: language === 'vi' ? 'Định dạng nền không hợp lệ' : 'Unsupported background format',
        description:
          language === 'vi'
            ? 'Hãy chọn ảnh (PNG, JPG, WebP) hoặc video (MP4, WebM).'
            : 'Please choose an image (PNG, JPG, WebP) or video (MP4, WebM).',
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setBackgroundAsset(file, objectUrl, file.name);
    updateBackground({
      type: isVideo ? 'video' : 'image',
      assetUrl: objectUrl,
      assetName: file.name,
    });
    addToast({
      type: 'success',
      title: language === 'vi' ? 'Đã cập nhật hình nền' : 'Background asset updated',
      description: file.name,
    });
  };

  const handleImportProjectJson = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const raw = await file.text();
      const validated = parseAndValidateProjectJson(raw);
      setProject(validated);
      await saveProjectToDb(validated);
      await refreshProjectList();
      addToast({
        type: 'success',
        title: language === 'vi' ? 'Đã nhập dự án JSON' : 'Imported JSON project',
        description: validated.name,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: language === 'vi' ? 'Lỗi nhập file dự án' : 'Project JSON Import Failed',
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleExportProjectJson = () => {
    const json = serializeProjectJson(project);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'karaokeforge-project'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="w-full lg:w-72 xl:w-80 bg-forge-panel border-b lg:border-b-0 lg:border-r border-forge-border flex flex-col shrink-0 select-none">
      <div className="grid grid-cols-3 border-b border-forge-border bg-forge-bg/40 p-1 gap-1">
        <button
          type="button"
          onClick={() => setLeftTab('media')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition ${
            leftTab === 'media'
              ? 'bg-forge-surface text-white shadow-sm'
              : 'text-forge-muted hover:text-forge-text'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>{t(language, 'mediaTab')}</span>
        </button>

        <button
          type="button"
          onClick={() => setLeftTab('background')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition ${
            leftTab === 'background'
              ? 'bg-forge-surface text-white shadow-sm'
              : 'text-forge-muted hover:text-forge-text'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>{t(language, 'backgroundTab')}</span>
        </button>

        <button
          type="button"
          onClick={() => setLeftTab('projects')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition ${
            leftTab === 'projects'
              ? 'bg-forge-surface text-white shadow-sm'
              : 'text-forge-muted hover:text-forge-text'
          }`}
        >
          <FolderKanban className="w-3.5 h-3.5" />
          <span>{t(language, 'projectsTab')}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {leftTab === 'media' && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac"
              className="hidden"
              onChange={(e) => handleAudioSelect(e.target.files)}
            />

            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                handleAudioSelect(e.dataTransfer.files);
              }}
              className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-forge-accent ${
                isDraggingOver
                  ? 'border-forge-highlight bg-forge-accent/15'
                  : 'border-forge-border hover:border-forge-accent bg-forge-surface/30'
              }`}
            >
              {decodeStatus === 'loading' ? (
                <Loader2 className="w-8 h-8 text-forge-highlight mx-auto mb-2 animate-spin" />
              ) : (
                <UploadCloud className="w-8 h-8 text-forge-highlight mx-auto mb-2" />
              )}
              <p className="text-xs font-semibold text-forge-text">{t(language, 'uploadAudio')}</p>
              <p className="text-[11px] text-forge-muted mt-1">{t(language, 'dropAudioHint')}</p>
              <p className="text-[10px] text-forge-muted/80 mt-1.5">
                {language === 'vi'
                  ? 'Hỗ trợ dán file trực tiếp bằng Ctrl+V'
                  : 'Supports direct clipboard paste via Ctrl+V'}
              </p>
            </div>

            {decodeError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div>{decodeError}</div>
              </div>
            )}

            {project.audioMetadata ? (
              <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white truncate" title={project.audioMetadata.fileName}>
                    {project.audioMetadata.fileName}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono text-[10px] shrink-0">
                    Decoded
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-forge-muted text-[11px] font-mono">
                  <div>Thời lượng: {formatTimeDisplay(project.audioMetadata.duration)}</div>
                  <div>Sample: {project.audioMetadata.sampleRate} Hz</div>
                  <div>Số kênh: {project.audioMetadata.numberOfChannels} ch</div>
                  <div>Kích thước: {formatBytes(project.audioMetadata.fileSize)}</div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-forge-surface/40 border border-forge-border text-xs text-forge-muted text-center">
                {t(language, 'noAudioLoaded')}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  {project.settings.isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-forge-highlight" />
                  )}
                  <span>{language === 'vi' ? 'Âm lượng nhạc nền' : 'Music Track Volume'}</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setVolume(project.settings.musicVolume, !project.settings.isMuted)
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                    project.settings.isMuted
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : 'bg-forge-bg border-forge-border text-forge-muted hover:text-white'
                  }`}
                >
                  {project.settings.isMuted ? 'Muted' : 'Mute'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.01}
                  value={project.settings.isMuted ? 0 : project.settings.musicVolume}
                  onChange={(e) => setVolume(Number(e.target.value), false)}
                  className="flex-1 accent-forge-accent cursor-pointer"
                />
                <span className="font-mono text-[11px] w-10 text-right">
                  {project.settings.isMuted
                    ? '0%'
                    : `${Math.round(project.settings.musicVolume * 100)}%`}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-amber-400" />
                  <span>{language === 'vi' ? 'Cắt khoảng xuất (Trim)' : 'Trim Export Range'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => updateSettings({ trimStart: 0, trimEnd: duration })}
                  className="text-[11px] text-forge-highlight hover:underline"
                >
                  Reset
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] text-forge-muted block">
                    {language === 'vi' ? 'Bắt đầu (s)' : 'Start (s)'}
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, (project.settings.trimEnd ?? duration) - 0.5)}
                      step={0.1}
                      value={Number(project.settings.trimStart.toFixed(2))}
                      onChange={(e) =>
                        updateSettings({
                          trimStart: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full bg-forge-bg border border-forge-border rounded px-2 py-1 font-mono text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => updateSettings({ trimStart: Number(currentTime.toFixed(2)) })}
                      className="px-1.5 py-1 rounded bg-forge-bg hover:bg-slate-800 border border-forge-border text-[10px] font-mono text-forge-highlight shrink-0"
                      title="Lấy thời điểm hiện tại"
                    >
                      In
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-forge-muted block">
                    {language === 'vi' ? 'Kết thúc (s)' : 'End (s)'}
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min={project.settings.trimStart + 0.5}
                      max={duration}
                      step={0.1}
                      value={Number((project.settings.trimEnd ?? duration).toFixed(2))}
                      onChange={(e) =>
                        updateSettings({
                          trimEnd: Math.min(duration, Math.max(0.5, Number(e.target.value) || duration)),
                        })
                      }
                      className="w-full bg-forge-bg border border-forge-border rounded px-2 py-1 font-mono text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          trimEnd: Math.max(project.settings.trimStart + 0.5, Number(currentTime.toFixed(2))),
                        })
                      }
                      className="px-1.5 py-1 rounded bg-forge-bg hover:bg-slate-800 border border-forge-border text-[10px] font-mono text-forge-highlight shrink-0"
                      title="Lấy thời điểm hiện tại"
                    >
                      Out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {leftTab === 'background' && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-1.5 bg-forge-bg p-1 rounded-lg border border-forge-border">
              {(['gradient', 'image', 'video'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateBackground({ type: mode })}
                  className={`py-1.5 rounded font-medium capitalize transition ${
                    project.settings.background.type === mode
                      ? 'bg-forge-accent text-white'
                      : 'text-forge-muted hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-3">
              <div className="font-semibold text-white">Màu Gradient nền</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Màu 1</span>
                  <input
                    type="color"
                    value={project.settings.background.color1}
                    onChange={(e) => updateBackground({ color1: e.target.value })}
                    className="w-full h-8 rounded cursor-pointer bg-forge-bg border border-forge-border"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-forge-muted">Màu 2</span>
                  <input
                    type="color"
                    value={project.settings.background.color2}
                    onChange={(e) => updateBackground({ color2: e.target.value })}
                    className="w-full h-8 rounded cursor-pointer bg-forge-bg border border-forge-border"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-forge-muted">
                  <span>Góc xoay Gradient</span>
                  <span className="font-mono">{project.settings.background.gradientAngle}°</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={project.settings.background.gradientAngle}
                  onChange={(e) => updateBackground({ gradientAngle: Number(e.target.value) })}
                  className="w-full accent-forge-accent"
                />
              </label>
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-2.5">
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*,video/mp4,video/webm"
                className="hidden"
                onChange={(e) => handleBackgroundAssetSelect(e.target.files)}
              />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-forge-highlight" />
                  <span>Ảnh tĩnh / Video nền</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => bgFileInputRef.current?.click()}
                className="w-full py-2 px-3 rounded-lg bg-forge-bg hover:bg-slate-800 border border-forge-border text-forge-text font-medium transition"
              >
                Chọn ảnh hoặc video (MP4/WebM)
              </button>
              {project.settings.background.assetName && (
                <p className="text-[11px] text-emerald-400 truncate font-mono">
                  Đang dùng: {project.settings.background.assetName}
                </p>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-3">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Hiệu ứng động & Ánh sáng</span>
              </div>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-forge-muted">Hạt ánh sáng (Particles)</span>
                <input
                  type="checkbox"
                  checked={project.settings.background.particles}
                  onChange={(e) => updateBackground({ particles: e.target.checked })}
                  className="accent-forge-accent"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-forge-muted">Chuyển động Gradient nhẹ</span>
                <input
                  type="checkbox"
                  checked={project.settings.background.animateGradient}
                  onChange={(e) => updateBackground({ animateGradient: e.target.checked })}
                  className="accent-forge-accent"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-forge-muted">Viền tối (Vignette)</span>
                <input
                  type="checkbox"
                  checked={project.settings.background.vignette}
                  onChange={(e) => updateBackground({ vignette: e.target.checked })}
                  className="accent-forge-accent"
                />
              </label>

              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-forge-muted">
                  <span>Độ mờ nền (Blur)</span>
                  <span className="font-mono">{project.settings.background.blur}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={project.settings.background.blur}
                  onChange={(e) => updateBackground({ blur: Number(e.target.value) })}
                  className="w-full accent-forge-accent"
                />
              </label>

              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-forge-muted">
                  <span>Độ sáng nền (Brightness)</span>
                  <span className="font-mono">{project.settings.background.brightness}%</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={130}
                  value={project.settings.background.brightness}
                  onChange={(e) => updateBackground({ brightness: Number(e.target.value) })}
                  className="w-full accent-forge-accent"
                />
              </label>
            </div>
          </div>
        )}

        {leftTab === 'projects' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-2.5">
              <div className="font-semibold text-white">Dự án hiện tại</div>
              <label className="block space-y-1">
                <span className="text-[11px] text-forge-muted">Tên dự án / Tiêu đề bài hát</span>
                <input
                  type="text"
                  value={project.name}
                  onChange={(e) => updateProjectName(e.target.value)}
                  className="w-full bg-forge-bg border border-forge-border rounded px-2.5 py-1.5 text-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-forge-muted">Ca sĩ / Tác giả hiển thị ở Intro</span>
                <input
                  type="text"
                  value={project.settings.artist || ''}
                  onChange={(e) => updateSettings({ artist: e.target.value })}
                  className="w-full bg-forge-bg border border-forge-border rounded px-2.5 py-1.5 text-white"
                />
              </label>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void createNewAndSave()}
                  className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-forge-accent hover:bg-forge-accentHover text-white font-semibold transition"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>Dự án mới</span>
                </button>
                <button
                  type="button"
                  onClick={() => void duplicateProjectById(project.id)}
                  className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-forge-bg hover:bg-slate-800 border border-forge-border text-white font-medium transition"
                >
                  <Copy className="w-3.5 h-3.5 text-forge-highlight" />
                  <span>Nhân bản</span>
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-forge-surface border border-forge-border space-y-2.5">
              <div className="font-semibold text-white">Sao lưu & Di chuyển (.json)</div>
              <input
                ref={jsonProjectInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => void handleImportProjectJson(e.target.files)}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => jsonProjectInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-forge-bg hover:bg-slate-800 border border-forge-border text-forge-text"
                >
                  <FileJson className="w-3.5 h-3.5 text-amber-400" />
                  <span>Nhập JSON</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportProjectJson}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-forge-bg hover:bg-slate-800 border border-forge-border text-forge-text"
                >
                  <Download className="w-3.5 h-3.5 text-forge-highlight" />
                  <span>Xuất JSON</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">
                  Dự án đã lưu trên trình duyệt ({recentProjects.length})
                </span>
              </div>

              {recentProjects.length === 0 ? (
                <div className="p-4 rounded-xl bg-forge-surface/40 border border-forge-border text-center text-forge-muted">
                  Chưa có dự án nào được lưu.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentProjects.map((item) => {
                    const isCurrent = item.id === project.id;
                    const dateStr = new Date(item.updatedAt).toLocaleString(
                      language === 'vi' ? 'vi-VN' : 'en-US',
                      {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }
                    );

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
                          isCurrent
                            ? 'bg-forge-accent/15 border-forge-accent text-white'
                            : 'bg-forge-surface border-forge-border text-forge-text'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold truncate">{item.name}</span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.2 rounded bg-forge-accent text-[9px] font-bold text-white shrink-0">
                                ĐANG MỞ
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-forge-muted font-mono mt-0.5">
                            Cập nhật: {dateStr}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => void openProjectById(item.id)}
                              className="p-1.5 rounded bg-forge-bg hover:bg-slate-800 border border-forge-border text-forge-highlight"
                              title="Mở dự án này"
                              aria-label={`Mở dự án ${item.name}`}
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void duplicateProjectById(item.id)}
                            className="p-1.5 rounded bg-forge-bg hover:bg-slate-800 border border-forge-border text-forge-muted hover:text-white"
                            title="Nhân bản dự án"
                            aria-label={`Nhân bản dự án ${item.name}`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteProjectById(item.id)}
                            className="p-1.5 rounded bg-forge-bg hover:bg-slate-800 border border-forge-border text-forge-muted hover:text-rose-400"
                            title="Xóa dự án"
                            aria-label={`Xóa dự án ${item.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
