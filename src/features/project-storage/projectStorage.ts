import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { KaraokeProject } from '../../types/project';
import { createId } from '../../utils/id';

const DB_NAME = 'karaokeforge_db';
const DB_VERSION = 1;

export interface ProjectSummaryItem {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  hasAudio: boolean;
  lyricCount: number;
  aspectRatio: string;
}

interface KaraokeForgeDB extends DBSchema {
  projects: {
    key: string;
    value: KaraokeProject;
    indexes: { 'by-updated': number };
  };
  meta: {
    key: string;
    value: string;
  };
}

let dbPromise: Promise<IDBPDatabase<KaraokeForgeDB>> | null = null;

function getDb(): Promise<IDBPDatabase<KaraokeForgeDB>> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('Trình duyệt không hỗ trợ IndexedDB.'));
  }

  if (!dbPromise) {
    dbPromise = openDB<KaraokeForgeDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          const store = db.createObjectStore('projects', { keyPath: 'id' });
          store.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
  }

  return dbPromise;
}

export async function saveProjectToDb(project: KaraokeProject): Promise<void> {
  const db = await getDb();
  const recordToSave: KaraokeProject = {
    ...project,
    updatedAt: Date.now(),
    settings: {
      ...project.settings,
      background: {
        ...project.settings.background,
        assetUrl: project.backgroundAssetRef ? undefined : project.settings.background.assetUrl,
      },
    },
  };

  const tx = db.transaction(['projects', 'meta'], 'readwrite');
  await tx.objectStore('projects').put(recordToSave);
  await tx.objectStore('meta').put(recordToSave.id, 'lastActiveProjectId');
  await tx.done;
}

export async function loadProjectFromDb(id: string): Promise<KaraokeProject | null> {
  const db = await getDb();
  const project = await db.get('projects', id);
  if (!project) return null;

  await db.put('meta', project.id, 'lastActiveProjectId');
  return project;
}

export async function loadLastActiveProjectFromDb(): Promise<KaraokeProject | null> {
  const db = await getDb();
  const lastId = await db.get('meta', 'lastActiveProjectId');
  if (lastId) {
    const found = await db.get('projects', lastId);
    if (found) return found;
  }

  const all = await db.getAllFromIndex('projects', 'by-updated');
  if (all.length === 0) return null;
  return all[all.length - 1];
}

export async function listProjectsFromDb(): Promise<ProjectSummaryItem[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('projects', 'by-updated');

  return all
    .reverse()
    .map((p) => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
      hasAudio: Boolean(p.audioFileRef),
      lyricCount: p.lyrics.length,
      aspectRatio: p.settings.aspectRatio,
    }));
}

export async function duplicateProjectInDb(id: string): Promise<KaraokeProject | null> {
  const db = await getDb();
  const source = await db.get('projects', id);
  if (!source) return null;

  const now = Date.now();
  const duplicated: KaraokeProject = {
    ...structuredClone({
      ...source,
      audioFileRef: null,
      backgroundAssetRef: null,
    }),
    id: createId('proj'),
    name: `${source.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    audioFileRef: source.audioFileRef,
    backgroundAssetRef: source.backgroundAssetRef,
  };

  await saveProjectToDb(duplicated);
  return duplicated;
}

export async function deleteProjectFromDb(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['projects', 'meta'], 'readwrite');
  await tx.objectStore('projects').delete(id);

  const lastId = await tx.objectStore('meta').get('lastActiveProjectId');
  if (lastId === id) {
    await tx.objectStore('meta').delete('lastActiveProjectId');
  }
  await tx.done;
}
