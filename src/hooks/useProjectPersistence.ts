import { useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { audioEngine } from '../features/audio-engine/audioEngine';
import {
  deleteProjectFromDb,
  duplicateProjectInDb,
  listProjectsFromDb,
  loadLastActiveProjectFromDb,
  loadProjectFromDb,
  saveProjectToDb,
} from '../features/project-storage/projectStorage';
import { KaraokeProject } from '../types/project';

let hasHydratedInitialProject = false;

async function hydrateProjectMediaIntoRuntime(project: KaraokeProject): Promise<void> {
  const store = useProjectStore.getState();

  let hydratedProject = project;
  if (project.backgroundAssetRef) {
    const bgUrl = URL.createObjectURL(project.backgroundAssetRef);
    hydratedProject = {
      ...project,
      settings: {
        ...project.settings,
        background: {
          ...project.settings.background,
          assetUrl: bgUrl,
        },
      },
    };
  }

  store.setProject(hydratedProject);

  if (hydratedProject.audioFileRef) {
    try {
      const explicitName = hydratedProject.audioMetadata?.fileName || 'saved-audio';
      const { metadata, peaks } = await audioEngine.decodeAudioFile(
        hydratedProject.audioFileRef,
        explicitName
      );
      store.setAudioData(hydratedProject.audioFileRef, metadata, peaks);
      store.setSaveStatus('saved');
    } catch {
      store.addToast({
        type: 'warning',
        title: 'Không thể khôi phục bộ đệm âm thanh',
        description: 'Vui lòng tải lại file nhạc cho dự án này.',
      });
    }
  }
}

export function useProjectPersistence() {
  const project = useProjectStore((s) => s.project);
  const saveStatus = useProjectStore((s) => s.saveStatus);
  const language = useProjectStore((s) => s.language);
  const setSaveStatus = useProjectStore((s) => s.setSaveStatus);
  const setRecentProjects = useProjectStore((s) => s.setRecentProjects);
  const resetNewProject = useProjectStore((s) => s.resetNewProject);
  const addToast = useProjectStore((s) => s.addToast);

  const autosaveTimerRef = useRef<number | null>(null);

  const refreshProjectList = useCallback(async () => {
    try {
      const list = await listProjectsFromDb();
      setRecentProjects(
        list.map((item) => ({
          id: item.id,
          name: item.name,
          updatedAt: item.updatedAt,
        }))
      );
    } catch {}
  }, [setRecentProjects]);

  const saveNow = useCallback(
    async (showToast = false) => {
      try {
        setSaveStatus('saving');
        const currentProj = useProjectStore.getState().project;
        await saveProjectToDb(currentProj);
        await refreshProjectList();
        setSaveStatus('saved');

        if (showToast) {
          addToast({
            type: 'success',
            title: language === 'vi' ? 'Đã lưu dự án vào thiết bị' : 'Project saved locally',
            description: currentProj.name,
          });
        }
      } catch (err) {
        setSaveStatus('unsaved');
        if (showToast) {
          addToast({
            type: 'error',
            title: language === 'vi' ? 'Lỗi lưu dự án' : 'Failed to save project',
            description: err instanceof Error ? err.message : undefined,
          });
        }
      }
    },
    [setSaveStatus, refreshProjectList, addToast, language]
  );

  const openProjectById = useCallback(
    async (id: string) => {
      try {
        audioEngine.pause();
        const loaded = await loadProjectFromDb(id);
        if (!loaded) {
          addToast({
            type: 'error',
            title: language === 'vi' ? 'Không tìm thấy dự án' : 'Project not found',
          });
          return;
        }
        await hydrateProjectMediaIntoRuntime(loaded);
        await refreshProjectList();
        addToast({
          type: 'info',
          title: language === 'vi' ? `Đã mở: ${loaded.name}` : `Opened: ${loaded.name}`,
        });
      } catch (err) {
        addToast({
          type: 'error',
          title: language === 'vi' ? 'Không thể mở dự án' : 'Failed to open project',
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refreshProjectList, addToast, language]
  );

  const duplicateProjectById = useCallback(
    async (id: string) => {
      try {
        const copy = await duplicateProjectInDb(id);
        if (!copy) return;
        await hydrateProjectMediaIntoRuntime(copy);
        await refreshProjectList();
        addToast({
          type: 'success',
          title: language === 'vi' ? 'Đã nhân bản dự án' : 'Project duplicated',
          description: copy.name,
        });
      } catch {
        addToast({
          type: 'error',
          title: language === 'vi' ? 'Không thể nhân bản dự án' : 'Failed to duplicate project',
        });
      }
    },
    [refreshProjectList, addToast, language]
  );

  const deleteProjectById = useCallback(
    async (id: string) => {
      try {
        await deleteProjectFromDb(id);
        const list = await listProjectsFromDb();
        setRecentProjects(
          list.map((item) => ({
            id: item.id,
            name: item.name,
            updatedAt: item.updatedAt,
          }))
        );

        const currentId = useProjectStore.getState().project.id;
        if (currentId === id) {
          if (list.length > 0) {
            const nextProj = await loadProjectFromDb(list[0].id);
            if (nextProj) {
              await hydrateProjectMediaIntoRuntime(nextProj);
              return;
            }
          }
          audioEngine.pause();
          resetNewProject(language === 'vi' ? 'Dự án Karaoke mới' : 'New Karaoke Project');
        }

        addToast({
          type: 'info',
          title: language === 'vi' ? 'Đã xóa dự án' : 'Project deleted',
        });
      } catch {
        addToast({
          type: 'error',
          title: language === 'vi' ? 'Not possible to delete' : 'Failed to delete project',
        });
      }
    },
    [setRecentProjects, resetNewProject, addToast, language]
  );

  const createNewAndSave = useCallback(async () => {
    audioEngine.pause();
    resetNewProject(language === 'vi' ? 'Dự án Karaoke mới' : 'New Karaoke Project');
    const fresh = useProjectStore.getState().project;
    await saveProjectToDb(fresh);
    await refreshProjectList();
    addToast({
      type: 'success',
      title: language === 'vi' ? 'Đã tạo dự án mới' : 'Created new project',
    });
  }, [resetNewProject, refreshProjectList, addToast, language]);

  useEffect(() => {
    if (hasHydratedInitialProject) return;
    hasHydratedInitialProject = true;

    void (async () => {
      try {
        const last = await loadLastActiveProjectFromDb();
        if (last) {
          await hydrateProjectMediaIntoRuntime(last);
        } else {
          await saveProjectToDb(useProjectStore.getState().project);
        }
        await refreshProjectList();
      } catch {}
    })();
  }, [refreshProjectList]);

  useEffect(() => {
    if (saveStatus !== 'unsaved') return;

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void saveNow(false);
    }, 700);

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [project, saveStatus, saveNow]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveNow]);

  return {
    saveNow,
    openProjectById,
    duplicateProjectById,
    deleteProjectById,
    createNewAndSave,
    refreshProjectList,
  };
}
