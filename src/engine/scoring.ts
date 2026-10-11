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

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Баллы игроков по регламенту. Возвращает null, пока игра не завершена. */
export function computeScores(s: GameState): SeatScore[] | null {
  if (!s.result) return null;
  const sc = s.regulation.scoring;
  const winner = s.result.winner;

  return s.seats.map((seat) => {
    const team = teamOf(seat);
    const won = team === winner;
    const base = won ? sc.win : sc.loss;
    const extra = s.extraPoints[seat.seat] ?? 0;
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
