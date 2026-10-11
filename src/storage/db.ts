// Простое хранилище «ключ — значение» поверх IndexedDB.
// Если IndexedDB недоступен (например, в приватном режиме), используется localStorage.

const DB_NAME = 'mafioznik';
const STORE = 'kv';
const LS_PREFIX = 'mafioznik:';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступен'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Не удалось открыть базу'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error ?? new Error('Ошибка базы'));
        tx.onabort = () => reject(tx.error ?? new Error('Транзакция прервана'));
      }),
  );
}

function lsGet<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    // Хранилище недоступно: данные останутся только в памяти.
  }
}

function lsDel(key: string): void {
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    // игнорируем
  }
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>('readonly', (s) => s.get(key));
  } catch {
    return lsGet<T>(key);
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(value, key));
  } catch {
    lsSet(key, value);
  }
}

export async function kvDel(key: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(key));
  } catch {
    lsDel(key);
  }
}

/** Ключи хранилища приложения. */
export const KEYS = {
  activeSession: 'activeSession',
  history: 'history',
  lastLineup: 'lastLineup',
  knownNicknames: 'knownNicknames',
} as const;
