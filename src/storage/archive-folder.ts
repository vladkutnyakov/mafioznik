// Чтение и запись архива в папке:
//
//   mafioznik.json     — метка папки и версия формата
//   players.json       — игроки
//   tournaments.json   — турниры
//   games/*.json       — по файлу на игру
//
// Статистика в папке не хранится: она считается по играм.

import type { GameSession } from '../session/session';
import { ARCHIVE_FORMAT, gameFileName, type Archive, type PlayerRecord, type TournamentRecord } from './archive-model';

/** Папка, в которую можно писать. Пути — список имён от корня папки. */
export interface Folder {
  readonly name: string;
  /** Текст файла или undefined, если файла нет. */
  read(path: string[]): Promise<string | undefined>;
  /** Записывает файл, создавая недостающие подпапки. */
  write(path: string[], text: string): Promise<void>;
  /** Имена файлов в подпапке; пустой список, если её нет. */
  list(dir: string[]): Promise<string[]>;
}

export const GAMES_DIR = 'games';
const META_FILE = 'mafioznik.json';
const PLAYERS_FILE = 'players.json';
const TOURNAMENTS_FILE = 'tournaments.json';

export interface FolderContents {
  archive: Archive;
  /** Файлы игр, которые не удалось прочитать. */
  broken: string[];
}

const toJson = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

async function readJson(folder: Folder, path: string[]): Promise<unknown> {
  const text = await folder.read(path);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Файл ${path.join('/')} повреждён: это не JSON.`);
  }
}

function checkFormat(data: unknown, file: string): Record<string, unknown> | undefined {
  if (data === undefined) return undefined;
  if (typeof data !== 'object' || data === null) throw new Error(`Файл ${file} не похож на файл Мафиозника.`);
  const format = (data as { format?: unknown }).format;
  if (typeof format === 'number' && format > ARCHIVE_FORMAT) {
    throw new Error(`Папка записана более новой версией Мафиозника (формат ${format}). Обновите страницу.`);
  }
  return data as Record<string, unknown>;
}

const isGame = (x: unknown): x is GameSession =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as GameSession).id === 'string' &&
  typeof (x as GameSession).createdAt === 'number' &&
  Array.isArray((x as GameSession).events) &&
  Array.isArray((x as GameSession).setup?.seats);

export async function readFolder(folder: Folder): Promise<FolderContents> {
  checkFormat(await readJson(folder, [META_FILE]), META_FILE);
  const players = checkFormat(await readJson(folder, [PLAYERS_FILE]), PLAYERS_FILE)?.players;
  const tournaments = checkFormat(await readJson(folder, [TOURNAMENTS_FILE]), TOURNAMENTS_FILE)?.tournaments;

  const games: GameSession[] = [];
  const broken: string[] = [];
  const seen = new Set<string>();
  for (const name of (await folder.list([GAMES_DIR])).filter((n) => n.toLowerCase().endsWith('.json')).sort()) {
    try {
      const data = checkFormat(await readJson(folder, [GAMES_DIR, name]), name);
      const game = data?.game;
      if (!isGame(game)) throw new Error('не игра');
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      games.push(game);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Папка записана')) throw e;
      broken.push(name);
    }
  }

  return {
    archive: {
      games,
      players: Array.isArray(players) ? (players as PlayerRecord[]) : [],
      tournaments: Array.isArray(tournaments) ? (tournaments as TournamentRecord[]) : [],
    },
    broken,
  };
}

export const writeGame = (folder: Folder, game: GameSession) =>
  folder.write([GAMES_DIR, gameFileName(game)], toJson({ format: ARCHIVE_FORMAT, game }));

/** Записывает служебный файл и справочники. Файлы, которые не изменились, не трогает. */
export async function writeIndex(folder: Folder, archive: Archive): Promise<void> {
  const files: [string, string][] = [
    [META_FILE, toJson({ app: 'mafioznik', format: ARCHIVE_FORMAT })],
    [
      PLAYERS_FILE,
      toJson({
        format: ARCHIVE_FORMAT,
        players: [...archive.players].sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru')),
      }),
    ],
    [
      TOURNAMENTS_FILE,
      toJson({ format: ARCHIVE_FORMAT, tournaments: [...archive.tournaments].sort((a, b) => a.createdAt - b.createdAt) }),
    ],
  ];
  for (const [name, text] of files) {
    if ((await folder.read([name])) !== text) await folder.write([name], text);
  }
}
