import { currentCandidates, isAlive, nominatedBy, seatOf, type GameState } from '../../engine';

/** Почему нельзя выставить игрока сейчас. null — можно. */
export function nominateBlocker(state: GameState, target: number): string | null {
  const p = state.phase;
  if (p.kind !== 'speech') return 'Выставлять можно только во время речи.';
  if (!isAlive(seatOf(state, target))) return 'Игрок выбыл.';
  const reg = state.regulation.nominations;
  if (!reg.allowSelf && target === p.seat) return 'Нельзя выставить себя.';
  if (currentCandidates(state).includes(target)) return 'Уже выставлен.';
  if (nominatedBy(state, p.seat).length >= reg.perSpeech) return `Игрок №${p.seat} уже выставил кандидатуру.`;
  return null;
}

/** Есть ли ещё речи в этом дне после текущей. */
export function hasNextSpeaker(state: GameState): boolean {
  for (const item of state.queue) {
    if (item.kind === 'endSpeeches') return false;
    if (item.kind === 'speech' && isAlive(seatOf(state, item.seat))) return true;
  }
  return false;
}

export const nick = (state: GameState, seat: number): string => seatOf(state, seat).player.nickname;
