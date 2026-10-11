import { describe, expect, it } from 'vitest';
import { FIIM_REGULATION, GameRuleError, type GameSetup, type Role } from '../engine';
import { canRedo, canUndo, newSession, pushEvent, redo, sessionState, undo } from './session';

const ROLES: Role[] = ['civilian', 'mafia', 'civilian', 'sheriff', 'civilian', 'don', 'civilian', 'mafia', 'civilian', 'civilian'];
const setup: GameSetup = {
  regulation: FIIM_REGULATION,
  seats: ROLES.map((role, i) => ({ player: { nickname: `Игрок ${i + 1}` }, role })),
};

describe('партия', () => {
  it('не создаётся с неверной рассадкой', () => {
    expect(() => newSession({ ...setup, seats: setup.seats.slice(0, 9) })).toThrow(GameRuleError);
  });

  it('записывает действия и отклоняет недопустимые', () => {
    let s = newSession(setup);
    s = pushEvent(s, { type: 'advance' }, 100);
    expect(s.events).toEqual([{ at: 100, event: { type: 'advance' } }]);
    expect(() => pushEvent(s, { type: 'vote', votes: [1] })).toThrow(GameRuleError);
  });

  it('отменяет и возвращает действия', () => {
    let s = newSession(setup);
    s = pushEvent(s, { type: 'advance' });
    s = pushEvent(s, { type: 'advance' });
    expect(sessionState(s).phase).toEqual({ kind: 'night0', step: 'sheriffMeet' });
    s = undo(s);
    expect(canRedo(s)).toBe(true);
    expect(sessionState(s).phase).toEqual({ kind: 'night0', step: 'donMeet' });
    s = redo(s);
    expect(sessionState(s).phase).toEqual({ kind: 'night0', step: 'sheriffMeet' });
    expect(canRedo(s)).toBe(false);
  });

  it('новое действие очищает возможность вернуть отменённое', () => {
    let s = newSession(setup);
    s = pushEvent(s, { type: 'advance' });
    s = undo(s);
    s = pushEvent(s, { type: 'foul', seat: 3 });
    expect(canRedo(s)).toBe(false);
    expect(canUndo(s)).toBe(true);
  });
});
