// Библиотека музыки для ночи: метаданные треков и файлы хранятся на устройстве в IndexedDB.

import { makeId } from '../session/session';
import { kvDel, kvGet, kvSet, kvSetStrict } from '../storage/db';

export interface Track {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Длительность в секундах, если удалось определить. */
  duration: number | null;
  addedAt: number;
}

export type MusicOrder = 'sequential' | 'shuffle';

export interface MusicSettings {
  /** Включать музыку автоматически, когда наступает ночь. */
  autoplay: boolean;
  order: MusicOrder;
  /** Следующей ночью продолжать трек с места остановки. Иначе — новый трек каждую ночь. */
  resume: boolean;
  /** Громкость 0–1. */
  volume: number;
  /** Длительность плавного включения и затухания, секунды. */
  fadeSec: number;
}

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  autoplay: true,
  order: 'sequential',
  resume: true,
  volume: 0.8,
  fadeSec: 2,
};

const TRACKS_KEY = 'music:tracks';
const SETTINGS_KEY = 'music:settings';
const fileKey = (id: string) => `music:file:${id}`;

/** Индекс следующего трека. В случайном порядке не повторяет текущий трек подряд. */
export function pickNextIndex(current: number | null, count: number, order: MusicOrder, rnd = Math.random): number {
  if (count <= 0) return -1;
  if (order === 'sequential') return current === null ? 0 : (current + 1) % count;
  if (count === 1) return 0;
  if (current === null || current < 0 || current >= count) return Math.floor(rnd() * count);
  const i = Math.floor(rnd() * (count - 1));
  return i >= current ? i + 1 : i;
}

export async function listTracks(): Promise<Track[]> {
  return (await kvGet<Track[]>(TRACKS_KEY)) ?? [];
}

export async function loadMusicSettings(): Promise<MusicSettings> {
  const saved = await kvGet<Partial<MusicSettings>>(SETTINGS_KEY);
  return { ...DEFAULT_MUSIC_SETTINGS, ...saved };
}

export async function saveMusicSettings(settings: MusicSettings): Promise<void> {
  await kvSet(SETTINGS_KEY, settings);
}

export async function getTrackFile(id: string): Promise<Blob | undefined> {
  const value = await kvGet<Blob>(fileKey(id));
  return value instanceof Blob ? value : undefined;
}

/** Длительность аудиофайла по его метаданным. */
function readDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), 5000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    audio.src = url;
  });
}

const stripExtension = (name: string) => name.replace(/\.[a-z0-9]{2,4}$/i, '');

/** Добавляет файлы в библиотеку. Бросает ошибку, если хранилище файлов недоступно. */
export async function addTracks(files: File[]): Promise<Track[]> {
  const tracks = await listTracks();
  const added: Track[] = [];
  for (const file of files) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|oga|wav|flac|webm)$/i.test(file.name)) continue;
    const id = makeId();
    try {
      await kvSetStrict(fileKey(id), file);
    } catch {
      throw new Error('Не удалось сохранить файл: хранилище устройства недоступно или переполнено.');
    }
    added.push({
      id,
      name: stripExtension(file.name),
      size: file.size,
      type: file.type,
      duration: await readDuration(file),
      addedAt: Date.now(),
    });
  }
  await kvSet(TRACKS_KEY, [...tracks, ...added]);
  // Просим браузер не удалять данные при нехватке места.
  void navigator.storage?.persist?.().catch(() => undefined);
  return added;
}

export async function removeTrack(id: string): Promise<void> {
  const tracks = await listTracks();
  await kvSet(
    TRACKS_KEY,
    tracks.filter((t) => t.id !== id),
  );
  await kvDel(fileKey(id));
}

export async function moveTrack(id: string, delta: -1 | 1): Promise<void> {
  const tracks = await listTracks();
  const i = tracks.findIndex((t) => t.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= tracks.length) return;
  const next = [...tracks];
  [next[i], next[j]] = [next[j]!, next[i]!];
  await kvSet(TRACKS_KEY, next);
}

export async function renameTrack(id: string, name: string): Promise<void> {
  const tracks = await listTracks();
  await kvSet(
    TRACKS_KEY,
    tracks.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t)),
  );
}
