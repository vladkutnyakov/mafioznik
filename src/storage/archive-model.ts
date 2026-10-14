// Архив клуба: сыгранные игры, игроки и турниры. Здесь только данные и правила их объединения,
// без чтения и записи: так их можно проверить тестами.

import { scoringSystem, type ScoringSystem } from '../engine';
import { makeId, type GameSession } from '../session/session';

/** Версия формата файлов в папке. Повышается, когда формат меняется несовместимо. */
export const ARCHIVE_FORMAT = 1;

export interface PlayerRecord {
  id: string;
  nickname: string;
  createdAt: number;
}

export interface TournamentRecord {
  id: string;
  name: string;
  host: string;
  games: number;
  scoring: ScoringSystem;
  createdAt: number;
}

export interface Archive {
  /** Завершённые игры. */
  games: GameSession[];
  players: PlayerRecord[];
  tournaments: TournamentRecord[];
}

export const emptyArchive = (): Archive => ({ games: [], players: [], tournaments: [] });

/** Ники сравниваются без учёта регистра и пробелов по краям. */
export const nickKey = (nickname: string) => nickname.trim().toLowerCase();

/**
 * Добавляет завершённую игру: игрокам без id находит запись по нику или заводит новую,
 * турнир заносит в список турниров. Возвращает новый архив и игру в том виде, в каком она сохранена.
 */
export function addGame(archive: Archive, session: GameSession, now = Date.now()): { archive: Archive; game: GameSession } {
  const players = [...archive.players];
  const byNick = new Map(players.map((p) => [nickKey(p.nickname), p]));
  const byId = new Map(players.map((p) => [p.id, p]));

  const seats = session.setup.seats.map((seat) => {
    const nickname = seat.player.nickname.trim();
    let record = (seat.player.id && byId.get(seat.player.id)) || byNick.get(nickKey(nickname));
    if (!record) {
      record = { id: seat.player.id ?? makeId(), nickname, createdAt: now };
      players.push(record);
      byNick.set(nickKey(nickname), record);
      byId.set(record.id, record);
    }
    return { ...seat, player: { id: record.id, nickname } };
  });

  const game: GameSession = {
    ...session,
    setup: { ...session.setup, seats },
    redo: [],
    finishedAt: session.finishedAt ?? now,
  };

  let tournaments = archive.tournaments;
  const t = session.setup.tournament;
  if (t) {
    const record: TournamentRecord = {
      id: t.id,
      name: t.name,
      host: t.host,
      games: t.games,
      scoring: scoringSystem(session.setup.regulation),
      createdAt: tournaments.find((x) => x.id === t.id)?.createdAt ?? now,
    };
    tournaments = [...tournaments.filter((x) => x.id !== t.id), record];
  }

  return {
    archive: { games: [...archive.games.filter((g) => g.id !== game.id), game], players, tournaments },
    game,
  };
}

/**
 * Объединяет архив из папки с копией на этом компьютере. Папка главнее: при совпадении id берётся её версия.
 *
 * `seenInFolder` — игры, которые уже были в папке при прошлой синхронизации. Если такой игры там больше нет,
 * её удалили из папки вручную, и локальную копию тоже надо забыть. Остальные локальные игры добавляются.
 *
 * Игрок, заведённый локально, сливается с игроком из папки с тем же ником: в его играх меняется id.
 */
export function mergeArchives(folder: Archive, local: Archive, seenInFolder: ReadonlySet<string>): Archive {
  const players = [...folder.players];
  const folderIds = new Set(players.map((p) => p.id));
  const folderByNick = new Map(players.map((p) => [nickKey(p.nickname), p.id]));
  const remap = new Map<string, string>();
  for (const p of local.players) {
    if (folderIds.has(p.id)) continue;
    const same = folderByNick.get(nickKey(p.nickname));
    if (same) {
      remap.set(p.id, same);
    } else {
      players.push(p);
      folderIds.add(p.id);
      folderByNick.set(nickKey(p.nickname), p.id);
    }
  }

  const folderGameIds = new Set(folder.games.map((g) => g.id));
  const added = local.games
    .filter((g) => !folderGameIds.has(g.id) && !seenInFolder.has(g.id))
    .map((g) => (remap.size ? remapPlayers(g, remap) : g));

  const tournamentIds = new Set(folder.tournaments.map((t) => t.id));
  return {
    games: [...folder.games, ...added],
    players,
    tournaments: [...folder.tournaments, ...local.tournaments.filter((t) => !tournamentIds.has(t.id))],
  };
}

function remapPlayers(game: GameSession, remap: ReadonlyMap<string, string>): GameSession {
  return {
    ...game,
    setup: {
      ...game.setup,
      seats: game.setup.seats.map((s) => {
        const id = s.player.id && remap.get(s.player.id);
        return id ? { ...s, player: { ...s.player, id } } : s;
      }),
    },
  };
}

const pad = (n: number) => n.toString().padStart(2, '0');

/** Имя файла игры: дата и время начала, турнир с номером игры и начало id, чтобы имена не совпадали. */
export function gameFileName(game: GameSession): string {
  const d = new Date(game.createdAt);
  const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  const t = game.setup.tournament;
  const title = t ? `${safeName(t.name) || 'турнир'}_игра-${t.game}` : 'игра';
  return `${when}_${title}_${game.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}.json`;
}

/** Убирает символы, недопустимые в именах файлов Windows. */
function safeName(s: string): string {
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/\.+$/, '')
    .slice(0, 40);
}

/** Известные ники для подсказок: игроки и ведущие турниров. */
export function knownNicknames(archive: Archive): string[] {
  const names = new Map<string, string>();
  for (const p of archive.players) names.set(nickKey(p.nickname), p.nickname);
  for (const t of archive.tournaments) if (t.host.trim()) names.set(nickKey(t.host), t.host.trim());
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'ru'));
}

export const gamesInTournament = (archive: Archive, id: string) =>
  archive.games.filter((g) => g.setup.tournament?.id === id).length;
