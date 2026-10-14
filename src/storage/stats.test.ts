import { describe, expect, it } from 'vitest';
import { FIIM_REGULATION, withScoring, type GameEvent, type Role, type ScoringSystem, type TournamentInfo } from '../engine';
import type { GameSession } from '../session/session';
import { addGame, emptyArchive, type Archive } from './archive-model';
import { gameSummaries, playerStats, winRate } from './stats';

// Мафия №2 и №8, дон №6, шериф №4.
const TEN: Role[] = ['civilian', 'mafia', 'civilian', 'sheriff', 'civilian', 'don', 'civilian', 'mafia', 'civilian', 'civilian'];
const NICKS = ['Альфа', 'Бета', 'Гамма', 'Дельта', 'Эпсилон', 'Дзета', 'Эта', 'Тета', 'Йота', 'Каппа'];

const adv = (n: number): GameEvent[] => Array.from({ length: n }, () => ({ type: 'advance' }) as const);
// Город побеждает: все чёрные дисквалифицированы в День 1.
const RED_WINS: GameEvent[] = [...adv(3), ...[2, 6, 8].map((seat) => ({ type: 'disqualify', seat }) as const)];

function game(
  id: string,
  at: number,
  opts: { system?: ScoringSystem; events?: GameEvent[]; tournament?: TournamentInfo; nicks?: string[] } = {},
): GameSession {
  const nicks = opts.nicks ?? NICKS;
  return {
    id,
    createdAt: at,
    finishedAt: at + 1,
    setup: {
      regulation: withScoring(FIIM_REGULATION, opts.system ?? 'none'),
      seats: nicks.map((nickname, i) => ({ player: { nickname }, role: TEN[i] })),
      ...(opts.tournament && { tournament: opts.tournament }),
    },
    events: (opts.events ?? RED_WINS).map((event) => ({ at, event })),
    redo: [],
  };
}

const archiveOf = (...games: GameSession[]): Archive =>
  games.reduce((a, g) => addGame(a, g).archive, emptyArchive());

const CUP: TournamentInfo = { id: 'cup', name: 'Кубок', host: 'Ведущий', games: 2, game: 1 };

describe('статистика', () => {
  it('считает игры, победы и роли по завершённым играм', () => {
    const archive = archiveOf(game('a', 1), game('b', 2));
    const stats = playerStats(gameSummaries(archive), archive);
    expect(stats).toHaveLength(10);
    const alpha = stats.find((p) => p.nickname === 'Альфа')!;
    expect(alpha).toMatchObject({ games: 2, wins: 2, scoredGames: 0 });
    expect(alpha.byRole.civilian).toEqual({ games: 2, wins: 2 });
    const beta = stats.find((p) => p.nickname === 'Бета')!;
    expect(beta).toMatchObject({ games: 2, wins: 0, sanctions: 2 });
    expect(winRate(beta.byRole.mafia)).toBe(0);
    expect(winRate(beta.byRole.don)).toBeNull();
  });

  it('игрок узнаётся по id, даже если ник поправили', () => {
    let archive = archiveOf(game('a', 1));
    archive = { ...archive, players: archive.players.map((p) => (p.nickname === 'Альфа' ? { ...p, nickname: 'Альфа-2' } : p)) };
    const stats = playerStats(gameSummaries(archive), archive);
    expect(stats.find((p) => p.nickname === 'Альфа-2')?.games).toBe(1);
  });

  it('баллы суммируются только в играх с баллами', () => {
    const archive = archiveOf(game('a', 1, { system: 'simple', tournament: CUP }), game('b', 2));
    const alpha = playerStats(gameSummaries(archive), archive).find((p) => p.nickname === 'Альфа')!;
    expect(alpha).toMatchObject({ games: 2, scoredGames: 1, points: 2 });
  });

  it('фильтр по турниру и обычным играм, новые игры сверху', () => {
    const archive = archiveOf(game('a', 1, { tournament: CUP }), game('b', 2), game('c', 3));
    expect(gameSummaries(archive).map((s) => s.game.id)).toEqual(['c', 'b', 'a']);
    expect(gameSummaries(archive, { kind: 'tournament', id: 'cup' }).map((s) => s.game.id)).toEqual(['a']);
    expect(gameSummaries(archive, { kind: 'casual' }).map((s) => s.game.id)).toEqual(['c', 'b']);
  });

  it('игры без итога не попадают в статистику', () => {
    const archive = archiveOf(game('a', 1, { events: adv(3) }), game('b', 2, { events: [{ type: 'vote', votes: [1] }] }));
    const summaries = gameSummaries(archive);
    expect(summaries.map((s) => s.winner)).toEqual([null, null]);
    expect(summaries[0]!.state).toBeNull();
    expect(playerStats(summaries, archive)).toEqual([]);
  });
});
