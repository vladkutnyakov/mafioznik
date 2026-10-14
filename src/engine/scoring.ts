import { scoringSystem } from './regulation';
import { teamOf } from './selectors';
import type { GameState, PlayerRef, Role, Team } from './types';

export interface SeatScore {
  seat: number;
  player: PlayerRef;
  role: Role;
  team: Team;
  won: boolean;
  /** Баллы за победу или поражение. */
  base: number;
  extra: number;
  bestMove: number;
  /** Сумма штрафов, положительное число. */
  penalty: number;
  total: number;
}

/** Как ведущий выставляет доп. баллы в этой игре. */
export interface ExtraRules {
  /** Доп. баллы игрока, пока ведущий их не менял. */
  start: number;
  min: number;
  max: number;
  step: number;
  /**
   * Сумма доп. баллов за столом, если она постоянна: балл забирают у одного игрока и отдают другому.
   * null — баллы выставляются каждому независимо.
   */
  total: number | null;
}

/** Правила доп. баллов. null — баллы в этой игре не считаются. */
export function extraRules(s: GameState): ExtraRules | null {
  const sc = s.regulation.scoring;
  switch (scoringSystem(s.regulation)) {
    case 'none':
      return null;
    case 'simple': {
      // У каждого со старта один балл. За столом на 9–10 игрок забирает баллы у двоих, на 7–8 — у одного.
      const takes = s.seats.length >= 9 ? 2 : 1;
      return { start: 1, min: 0, max: Math.min(sc.extraMax, 1 + takes), step: 1, total: s.seats.length };
    }
    case 'fiim':
      return { start: 0, min: sc.extraMin, max: sc.extraMax, step: sc.extraStep, total: null };
  }
}

export function extraOf(s: GameState, seat: number): number {
  return s.extraPoints[seat] ?? extraRules(s)?.start ?? 0;
}

/** Сколько доп. баллов забрали, но ещё никому не отдали. 0, если сумма не постоянна. */
export function freeExtra(s: GameState): number {
  const rules = extraRules(s);
  if (!rules || rules.total === null) return 0;
  return rules.total - s.seats.reduce((sum, x) => sum + extraOf(s, x.seat), 0);
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Баллы игроков по регламенту. Возвращает null, пока игра не завершена или если баллы не считаются. */
export function computeScores(s: GameState): SeatScore[] | null {
  if (!s.result || !extraRules(s)) return null;
  const sc = s.regulation.scoring;
  const winner = s.result.winner;

  return s.seats.map((seat) => {
    const team = teamOf(seat);
    const won = team === winner;
    const base = won ? sc.win : sc.loss;
    const extra = extraOf(s, seat.seat);
    const bestMove =
      s.bestMove && s.bestMove.seat === seat.seat ? (s.regulation.bestMove.pointsByBlacks[s.bestMove.blacks] ?? 0) : 0;
    const penalty = s.sanctions
      .filter((x) => x.seat === seat.seat)
      .reduce((sum, x) => {
        if (x.kind === 'removal') return sum + sc.removalPenalty;
        if (x.kind === 'disqualification') return sum + sc.disqualificationPenalty;
        return sum + sc.ppkPenalty;
      }, 0);
    return {
      seat: seat.seat,
      player: seat.player,
      role: seat.role,
      team,
      won,
      base,
      extra,
      bestMove,
      penalty: round(penalty),
      total: round(base + extra + bestMove - penalty),
    };
  });
}
