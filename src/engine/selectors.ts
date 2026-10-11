import {
  ROLE_TEAM,
  SEAT_COUNT,
  type GameResult,
  type GameState,
  type NightRecord,
  type Phase,
  type Regulation,
  type Role,
  type SeatState,
  type Team,
} from './types';

export function seatOf(s: GameState, seat: number): SeatState {
  const found = s.seats[seat - 1];
  if (!found) throw new Error(`Нет места №${seat}`);
  return found;
}

export const isAlive = (seat: SeatState): boolean => seat.status === 'alive';

export const teamOf = (seat: SeatState): Team => ROLE_TEAM[seat.role];

export function aliveSeats(s: GameState): number[] {
  return s.seats.filter(isAlive).map((x) => x.seat);
}

export function aliveCount(s: GameState): number {
  return s.seats.filter(isAlive).length;
}

export function aliveByTeam(s: GameState): Record<Team, number> {
  const res: Record<Team, number> = { red: 0, black: 0 };
  for (const seat of s.seats) if (isAlive(seat)) res[teamOf(seat)] += 1;
  return res;
}

/** Места по кругу, начиная с `start` включительно. */
export function seatsFrom(start: number): number[] {
  return Array.from({ length: SEAT_COUNT }, (_, i) => ((start - 1 + i) % SEAT_COUNT) + 1);
}

/** Кандидаты текущего дня в порядке выставления (только живые). */
export function currentCandidates(s: GameState): number[] {
  return s.nominations
    .filter((n) => n.day === s.day && isAlive(seatOf(s, n.target)))
    .map((n) => n.target);
}

/** Кого выставил игрок в текущий день. */
export function nominatedBy(s: GameState, seat: number): number[] {
  return s.nominations.filter((n) => n.day === s.day && n.by === seat).map((n) => n.target);
}

/** Запись текущей ночи, если сейчас ночь (кроме Ночи 0). */
export function currentNight(s: GameState): NightRecord | undefined {
  const last = s.nights[s.nights.length - 1];
  return last && last.night === s.day ? last : undefined;
}

/** Игрок участвует в ночи: жив или убит этой же ночью (убитый узнаёт об этом только утром). */
export function actsTonight(s: GameState, seat: SeatState): boolean {
  if (isAlive(seat)) return true;
  return seat.status === 'killed' && currentNight(s)?.kill === seat.seat;
}

export function seatWithRole(s: GameState, role: Role): SeatState | undefined {
  return s.seats.find((x) => x.role === role);
}

/** Исход уже решён, но игра завершится после прощальных речей. */
export function pendingResult(s: GameState): GameResult | null {
  for (const item of s.queue) {
    if (item.kind === 'finishGame') return { winner: item.winner, reason: item.reason };
  }
  return null;
}

export function isDayPhase(phase: Phase): boolean {
  switch (phase.kind) {
    case 'speech':
    case 'voting':
    case 'tieSpeech':
    case 'liftAllVote':
    case 'farewell':
    case 'morning':
    case 'bestMove':
      return true;
    default:
      return false;
  }
}

/** Длительность таймера для фазы в секундах. null — фаза без таймера. */
export function phaseDuration(phase: Phase, reg: Regulation): number | null {
  const t = reg.timings;
  switch (phase.kind) {
    case 'night0':
      return phase.step === 'mafiaMeet' ? t.mafiaMeet : phase.step === 'donMeet' ? t.donMeet : t.sheriffMeet;
    case 'speech':
      return phase.shortened ? t.shortSpeech : t.speech;
    case 'tieSpeech':
      return t.tieSpeech;
    case 'farewell':
      return t.farewell;
    case 'night':
      return phase.step === 'shoot' ? null : t.nightCheck;
    default:
      return null;
  }
}
