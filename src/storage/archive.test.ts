import { describe, expect, it } from 'vitest';
import { FIIM_REGULATION, withScoring, type GameSetup } from '../engine';
import type { GameSession } from '../session/session';
import { GAMES_DIR, readFolder, writeGame, writeIndex, type Folder } from './archive-folder';
import { addGame, emptyArchive, gameFileName, knownNicknames, mergeArchives, type Archive } from './archive-model';

const NICKS = ['Альфа', 'Бета', 'Гамма', 'Дельта', 'Эпсилон', 'Дзета', 'Эта', 'Тета', 'Йота', 'Каппа'];

function session(id: string, nicks = NICKS, tournament?: GameSetup['tournament']): GameSession {
  return {
    id,
    createdAt: new Date(2026, 9, 14, 19, 5).getTime(),
    setup: {
      regulation: withScoring(FIIM_REGULATION, tournament ? 'simple' : 'none'),
      seats: nicks.map((nickname) => ({ player: { nickname } })),
      ...(tournament && { tournament }),
    },
    events: [],
    redo: [],
  };
}

function memoryFolder(files: Record<string, string> = {}): Folder & { files: Record<string, string> } {
  return {
    name: 'test',
    files,
    async read(path) {
      return files[path.join('/')];
    },
    async write(path, text) {
      files[path.join('/')] = text;
    },
    async list(dir) {
      const prefix = dir.join('/') + '/';
      return Object.keys(files)
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => k.slice(prefix.length));
    },
  };
}

describe('addGame', () => {
  it('заводит игроков по никам и переиспользует их в следующих играх', () => {
    const first = addGame(emptyArchive(), session('g1'));
    expect(first.archive.players).toHaveLength(10);
    expect(first.game.setup.seats.every((s) => s.player.id)).toBe(true);
    expect(first.game.finishedAt).toBeDefined();

    const second = addGame(first.archive, session('g2', [' альфа ', ...NICKS.slice(1)]));
    expect(second.archive.players).toHaveLength(10);
    expect(second.game.setup.seats[0]!.player.id).toBe(first.game.setup.seats[0]!.player.id);
    expect(second.game.setup.seats[0]!.player.nickname).toBe('альфа');
  });

  it('запоминает турнир с системой баллов', () => {
    const t = { id: 't1', name: 'Кубок', host: 'Ведущий', games: 5, game: 1 };
    const { archive } = addGame(emptyArchive(), session('g1', NICKS, t));
    expect(archive.tournaments).toEqual([expect.objectContaining({ id: 't1', name: 'Кубок', scoring: 'simple' })]);
    expect(knownNicknames(archive)).toContain('Ведущий');
  });

  it('повторное сохранение игры не создаёт дубликат', () => {
    const once = addGame(emptyArchive(), session('g1')).archive;
    expect(addGame(once, session('g1')).archive.games).toHaveLength(1);
  });
});

describe('mergeArchives', () => {
  it('добавляет локальные игры и сливает игроков с одинаковым ником', () => {
    const folder = addGame(emptyArchive(), session('g1')).archive;
    const local = addGame(emptyArchive(), session('g2', ['АЛЬФА', 'Новичок', ...NICKS.slice(2)])).archive;
    const merged = mergeArchives(folder, local, new Set());

    expect(merged.games.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(merged.players).toHaveLength(11);
    const alfa = folder.players.find((p) => p.nickname === 'Альфа')!;
    expect(merged.games[1]!.setup.seats[0]!.player.id).toBe(alfa.id);
    const ids = new Set(merged.players.map((p) => p.id));
    expect(merged.games.flatMap((g) => g.setup.seats).every((s) => ids.has(s.player.id!))).toBe(true);
  });

  it('забывает игру, которую удалили из папки', () => {
    const local = addGame(addGame(emptyArchive(), session('g1')).archive, session('g2')).archive;
    const folder: Archive = { ...local, games: local.games.filter((g) => g.id === 'g1') };
    expect(mergeArchives(folder, local, new Set(['g1', 'g2'])).games.map((g) => g.id)).toEqual(['g1']);
    expect(mergeArchives(folder, local, new Set(['g1'])).games.map((g) => g.id)).toEqual(['g1', 'g2']);
  });
});

describe('папка', () => {
  it('записывает и читает архив', async () => {
    const t = { id: 't1', name: 'Осенний: кубок?', host: 'Ведущий', games: 5, game: 3 };
    const { archive, game } = addGame(emptyArchive(), session('abcdef12-3456', NICKS, t));
    const folder = memoryFolder();
    await writeGame(folder, game);
    await writeIndex(folder, archive);

    expect(gameFileName(game)).toBe('2026-10-14_19-05_Осенний-кубок_игра-3_abcdef12.json');
    expect(Object.keys(folder.files).sort()).toEqual([
      `${GAMES_DIR}/${gameFileName(game)}`,
      'mafioznik.json',
      'players.json',
      'tournaments.json',
    ]);

    const read = await readFolder(folder);
    expect(read.broken).toEqual([]);
    expect(read.archive.games).toEqual([game]);
    expect(read.archive.players).toHaveLength(10);
    expect(read.archive.tournaments).toEqual(archive.tournaments);
  });

  it('пустая папка — пустой архив', async () => {
    expect(await readFolder(memoryFolder())).toEqual({ archive: emptyArchive(), broken: [] });
  });

  it('пропускает испорченные файлы игр', async () => {
    const folder = memoryFolder({ [`${GAMES_DIR}/bad.json`]: '{oops', [`${GAMES_DIR}/notes.txt`]: 'x' });
    expect((await readFolder(folder)).broken).toEqual(['bad.json']);
  });

  it('не открывает папку более новой версии', async () => {
    const folder = memoryFolder({ 'mafioznik.json': JSON.stringify({ app: 'mafioznik', format: 99 }) });
    await expect(readFolder(folder)).rejects.toThrow(/более новой версией/);
  });
});
