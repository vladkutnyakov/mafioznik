// Статистика клуба. Считается по журналам сыгранных игр: в архиве хранятся только игры.

import {
  ROLE_TEAM,
  computeScores,
  scoringSystem,
  tryReplay,
  type GameState,
  type PlayerRef,
  type Role,
  type ScoringSystem,
  type Team,
} from '../engine';
import type { GameSession } from '../session/session';
import { nickKey, type Archive } from './archive-model';

/** Какие игры учитывать: все, только обычные или игры одного турнира (по id). */
export type GameFilter = { kind: 'all' } | { kind: 'casual' } | { kind: 'tournament'; id: string };

export interface GameSummary {
  game: GameSession;
  /** Состояние после журнала. null — журнал не воспроизводится этой версией движка. */
  state: GameState | null;
  winner: Team | null;
  scoring: ScoringSystem;
}

export interface RoleStats {
  games: number;
  wins: number;
}

export interface PlayerStats {
  /** id игрока, а для игр без id — ник в нижнем регистре. */
  key: string;
  nickname: string;
  games: number;
  wins: number;
  byRole: Record<Role, RoleStats>;
  /** Сумма баллов в играх, где баллы считались. */
  points: number;
  scoredGames: number;
  /** Сколько раз был убит в Ночь 1. */
  firstKilled: number;
  /** Лучшие ходы и угаданные в них чёрные. */
  bestMoves: number;
  bestMoveBlacks: number;
  fouls: number;
  /** Удаления, дисквалификации и ППК. */
  sanctions: number;
  lastPlayedAt: number;
}

/** Игрок узнаётся по id, а в играх без id — по нику. */
export const playerKey = (player: PlayerRef) => player.id ?? nickKey(player.nickname);

const round = (x: number) => Math.round(x * 1000) / 1000;

export function matchesFilter(game: GameSession, filter: GameFilter): boolean {
  const t = game.setup.tournament;
  if (filter.kind === 'casual') return !t;
  if (filter.kind === 'tournament') return t?.id === filter.id;
  return true;
}

export function summarizeGame(game: GameSession): GameSummary {
  let state: GameState | null = null;
  try {
    const r = tryReplay(
      game.setup,
      game.events.map((e) => e.event),
    );
    state = r.failedAt === null ? r.state : null;
  } catch {
    state = null;
  }
  return { game, state, winner: state?.result?.winner ?? null, scoring: scoringSystem(game.setup.regulation) };
}

/** Игры по фильтру, новые сверху. */
export function gameSummaries(archive: Archive, filter: GameFilter = { kind: 'all' }): GameSummary[] {
  return archive.games
    .filter((g) => matchesFilter(g, filter))
    .sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt))
    .map(summarizeGame);
}

const emptyRoles = (): Record<Role, RoleStats> => ({
  civilian: { games: 0, wins: 0 },
  sheriff: { games: 0, wins: 0 },
  mafia: { games: 0, wins: 0 },
  don: { games: 0, wins: 0 },
});

/** Статистика игроков по завершённым играм. Ник берётся из списка игроков: его могли поправить в players.json. */
export function playerStats(summaries: readonly GameSummary[], archive: Archive): PlayerStats[] {
  const names = new Map(archive.players.map((p) => [p.id, p.nickname]));
  const stats = new Map<string, PlayerStats>();

  for (const { game, state } of summaries) {
    if (!state?.result) continue;
    const scores = computeScores(state);
    const when = game.finishedAt ?? game.createdAt;
    const firstKill = state.nights.find((n) => n.night === 1)?.kill ?? null;

    for (const seat of state.seats) {
      const key = playerKey(seat.player);
      let p = stats.get(key);
      if (!p) {
        p = {
          key,
          nickname: (seat.player.id && names.get(seat.player.id)) || seat.player.nickname,
          games: 0,
          wins: 0,
          byRole: emptyRoles(),
          points: 0,
          scoredGames: 0,
          firstKilled: 0,
          bestMoves: 0,
          bestMoveBlacks: 0,
          fouls: 0,
          sanctions: 0,
          lastPlayedAt: 0,
        };
        stats.set(key, p);
      }
      const won = ROLE_TEAM[seat.role] === state.result.winner;
      p.games += 1;
      p.byRole[seat.role].games += 1;
      if (won) {
        p.wins += 1;
        p.byRole[seat.role].wins += 1;
      }
      const score = scores?.find((x) => x.seat === seat.seat);
      if (score) {
        p.points = round(p.points + score.total);
        p.scoredGames += 1;
      }
      if (firstKill === seat.seat) p.firstKilled += 1;
      if (state.bestMove?.seat === seat.seat) {
        p.bestMoves += 1;
        p.bestMoveBlacks += state.bestMove.blacks;
      }
      p.fouls += seat.fouls;
      p.sanctions += state.sanctions.filter((x) => x.seat === seat.seat).length;
      p.lastPlayedAt = Math.max(p.lastPlayedAt, when);
    }
  }

  return [...stats.values()];
}

/** Доля побед в процентах. null, если игр не было. */
export const winRate = (s: RoleStats): number | null => (s.games ? Math.round((s.wins / s.games) * 100) : null);
