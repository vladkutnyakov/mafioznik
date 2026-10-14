// Папка на компьютере через File System Access API.

import type { Folder } from './archive-folder';

export const folderPickerSupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

/** Открывает выбор папки. Бросает AbortError, если ведущий закрыл окно. */
export function pickFolder(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) throw new Error('Этот браузер не умеет работать с папками. Откройте Мафиозник в Chrome или Edge.');
  return window.showDirectoryPicker({ id: 'mafioznik-archive', mode: 'readwrite', startIn: 'documents' });
}

export const hasAccess = async (handle: FileSystemDirectoryHandle) =>
  (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';

/** Спрашивает доступ к папке. Работает только по нажатию кнопки. */
export const requestAccess = async (handle: FileSystemDirectoryHandle) =>
  (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';

const isNotFound = (e: unknown) => e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');

export function handleFolder(root: FileSystemDirectoryHandle): Folder {
  const dir = async (path: string[], create: boolean) => {
    let d = root;
    for (const name of path) d = await d.getDirectoryHandle(name, { create });
    return d;
  };

  return {
    name: root.name,
    async read(path) {
      try {
        const d = await dir(path.slice(0, -1), false);
        const file = await (await d.getFileHandle(path[path.length - 1]!)).getFile();
        return await file.text();
      } catch (e) {
        if (isNotFound(e)) return undefined;
        throw e;
      }
    },
    async write(path, text) {
      const d = await dir(path.slice(0, -1), true);
      const handle = await d.getFileHandle(path[path.length - 1]!, { create: true });
      // Браузер пишет во временный файл и подменяет им настоящий при close(): оборванная запись его не испортит.
      const stream = await handle.createWritable();
      try {
        await stream.write(text);
        await stream.close();
      } catch (e) {
        await stream.abort().catch(() => undefined);
        throw e;
      }
    },
    async list(path) {
      let d: FileSystemDirectoryHandle;
      try {
        d = await dir(path, false);
      } catch (e) {
        if (isNotFound(e)) return [];
        throw e;
      }
      const names: string[] = [];
      for await (const entry of d.values()) if (entry.kind === 'file') names.push(entry.name);
      return names;
    },
  };
}
