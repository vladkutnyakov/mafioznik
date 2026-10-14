// Архив игр. Копия всегда лежит в браузере, поэтому игры сохраняются и без папки.
// Если ведущий выбрал папку, архив синхронизируется с ней при запуске и после каждой сохранённой игры.

import type { GameSession } from '../session/session';
import { kvDel, kvGet, kvSet, kvSetStrict } from './db';
import { readFolder, writeGame, writeIndex, type Folder } from './archive-folder';
import { addGame, emptyArchive, mergeArchives, type Archive } from './archive-model';
import { folderPickerSupported, handleFolder, hasAccess, pickFolder, requestAccess } from './fs-folder';

const LOCAL_KEY = 'archive';
const LINK_KEY = 'archiveFolder';

/** Выбранная папка и игры, которые в ней были при прошлой синхронизации. */
interface FolderLink {
  handle: FileSystemDirectoryHandle;
  seen: string[];
}

export type FolderState =
  | { kind: 'unsupported' }
  | { kind: 'none' }
  /** Папка выбрана, но браузер ждёт разрешения ведущего. */
  | { kind: 'locked'; name: string }
  | { kind: 'ready'; name: string };

export interface SyncResult {
  at: number;
  /** Сколько файлов игр записано в папку. */
  written: number;
  /** Файлы игр, которые не удалось прочитать. */
  broken: string[];
  error?: string;
}

let cache: Archive | undefined;
let last: SyncResult | undefined;
/** Синхронизации идут по одной, чтобы не писать в папку одновременно. */
let queue: Promise<unknown> = Promise.resolve();

const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
};

export async function getArchive(): Promise<Archive> {
  if (!cache) cache = { ...emptyArchive(), ...(await kvGet<Archive>(LOCAL_KEY)) };
  return cache;
}

async function setLocal(archive: Archive): Promise<void> {
  cache = archive;
  await kvSet(LOCAL_KEY, archive);
}

const getLink = () => kvGet<FolderLink>(LINK_KEY);

export const lastSync = () => last;

export async function folderState(): Promise<FolderState> {
  if (!folderPickerSupported()) return { kind: 'unsupported' };
  const link = await getLink();
  if (!link?.handle) return { kind: 'none' };
  const name = link.handle.name;
  try {
    return (await hasAccess(link.handle)) ? { kind: 'ready', name } : { kind: 'locked', name };
  } catch {
    return { kind: 'locked', name };
  }
}

async function syncWith(link: FolderLink): Promise<SyncResult> {
  const folder: Folder = handleFolder(link.handle);
  const result: SyncResult = { at: Date.now(), written: 0, broken: [] };
  try {
    const local = await getArchive();
    const { archive: inFolder, broken } = await readFolder(folder);
    result.broken = broken;
    // Если какой-то файл не читается, ничего не считаем удалённым: копия из браузера заменит испорченный файл.
    const seen = new Set(broken.length ? [] : link.seen);
    const merged = mergeArchives(inFolder, local, seen);
    const inFolderIds = new Set(inFolder.games.map((g) => g.id));
    for (const game of merged.games) {
      if (inFolderIds.has(game.id)) continue;
      await writeGame(folder, game);
      result.written++;
    }
    await writeIndex(folder, merged);
    await setLocal(merged);
    await kvSetStrict(LINK_KEY, { handle: link.handle, seen: merged.games.map((g) => g.id) } satisfies FolderLink);
  } catch (e) {
    result.error = describeError(e);
  }
  last = result;
  return result;
}

function describeError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError') return 'Нет доступа к папке. Разрешите доступ ещё раз.';
    if (e.name === 'NotFoundError') return 'Папка не найдена: возможно, её переместили или удалили. Выберите её заново.';
    if (e.name === 'QuotaExceededError') return 'На диске не хватает места.';
    if (e.name === 'NoModificationAllowedError') return 'Файл в папке занят другой программой. Попробуйте ещё раз.';
  }
  return e instanceof Error ? e.message : 'Не удалось синхронизировать папку.';
}

/** Синхронизирует архив с папкой, если она выбрана и доступ есть. Иначе ничего не делает. */
export function syncFolder(): Promise<SyncResult | undefined> {
  return serial(async () => {
    const link = await getLink();
    if (!link?.handle || !folderPickerSupported() || !(await hasAccess(link.handle).catch(() => false))) return undefined;
    return syncWith(link);
  });
}

/** Выбор папки. undefined — ведущий закрыл окно выбора. */
export async function chooseFolder(): Promise<SyncResult | undefined> {
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await pickFolder();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return undefined;
    throw e;
  }
  return serial(async () => {
    const prev = await getLink();
    const same = prev?.handle && (await prev.handle.isSameEntry(handle).catch(() => false));
    // В новую папку переносятся все игры из браузера.
    const link: FolderLink = { handle, seen: same ? prev.seen : [] };
    await kvSetStrict(LINK_KEY, link);
    return syncWith(link);
  });
}

/** Просит у браузера доступ к уже выбранной папке. Вызывать только по нажатию кнопки. */
export async function unlockFolder(): Promise<SyncResult | undefined> {
  const link = await getLink();
  if (!link?.handle) return undefined;
  if (!(await requestAccess(link.handle))) return undefined;
  return serial(() => syncWith(link));
}

/** Отвязывает папку. Файлы в ней и копия в браузере остаются. */
export async function forgetFolder(): Promise<void> {
  await serial(() => kvDel(LINK_KEY));
  last = undefined;
}

/** Сохраняет завершённую игру в браузер и, если можно, в папку. */
export async function saveFinishedGame(session: GameSession): Promise<SyncResult | undefined> {
  await serial(async () => {
    const { archive } = addGame(await getArchive(), session);
    await setLocal(archive);
  });
  return syncFolder();
}
