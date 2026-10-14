import { describe, expect, it } from 'vitest';
import {
  FIIM_REGULATION,
  GameRuleError,
  compositionFor,
  createGame,
  phaseDuration,
  replay,
  tryReplay,
  validateSetup,
  type GameEvent,
  type GameSetup,
  type Role,
} from './index';

/** Рассадка без ролей: роли ведущий отмечает в Ночь 0. */
function blind(players = 10): GameSetup {
  return {
    regulation: structuredClone(FIIM_REGULATION),
    composition: compositionFor(players),
    seats: Array.from({ length: players }, (_, i) => ({ player: { nickname: `Игрок ${i + 1}` } })),
  };
}

const adv: GameEvent = { type: 'advance' };
const mark = (seat: number, role: Role): GameEvent => ({ type: 'setRole', seat, role });

/** Ночь 0 на 10 игроков: чёрные 2, 6 (дон), 8; шериф 4. */
const NIGHT0: GameEvent[] = [
  adv,
  mark(2, 'mafia'),
  mark(6, 'mafia'),
  mark(8, 'mafia'),
  adv,
  mark(6, 'don'),
  adv,
  mark(4, 'sheriff'),
  adv,
];

describe('раздача ролей в Ночь 0', () => {
  it('рассадка без ролей допустима, частично заданные роли — нет', () => {
    expect(validateSetup(blind())).toEqual([]);
    const partial = blind();
    partial.seats[0]!.role = 'mafia';
    expect(validateSetup(partial).length).toBeGreaterThan(0);
  });

  it('начинается с раздачи карт без таймера', () => {
    const s = createGame(blind());
    expect(s.phase).toEqual({ kind: 'night0', step: 'deal' });
    expect(phaseDuration(s.phase, s.regulation)).toBeNull();
    expect(s.seats.every((x) => x.role === 'civilian')).toBe(true);
  });

  it('ведущий отмечает мафию, дона и шерифа, остальные — мирные', () => {
    const s = replay(blind(), NIGHT0);
    expect(s.day).toBe(1);
    expect(s.phase).toEqual({ kind: 'speech', seat: 1, shortened: false });
    expect(s.seats.map((x) => x.role)).toEqual([
      'civilian', 'mafia', 'civilian', 'sheriff', 'civilian', 'don', 'civilian', 'mafia', 'civilian', 'civilian',
    ]);
  });

  it('не пускает дальше, пока не отмечены все проснувшиеся', () => {
    expect(tryReplay(blind(), [adv, mark(2, 'mafia'), adv]).error).toMatch(/нужно 3, отмечено 1/);
    expect(tryReplay(blind(), NIGHT0.slice(0, 5).concat(adv)).error).toMatch(/дона/);
    expect(tryReplay(blind(), NIGHT0.slice(0, 7).concat(adv)).error).toMatch(/шерифа/);
  });

  it('не даёт отметить роль не на своём шаге и лишних чёрных', () => {
    expect(() => replay(blind(), [mark(2, 'mafia')])).toThrow(GameRuleError);
    expect(() => replay(blind(), [adv, mark(2, 'sheriff')])).toThrow(GameRuleError);
    expect(() => replay(blind(), [adv, mark(1, 'mafia'), mark(2, 'mafia'), mark(3, 'mafia'), mark(4, 'mafia')])).toThrow(
      /все уже отмечены/,
    );
    // Дон — только среди мафии, шериф — только среди красных.
    expect(() => replay(blind(), [...NIGHT0.slice(0, 5), mark(1, 'don')])).toThrow(GameRuleError);
    expect(() => replay(blind(), [...NIGHT0.slice(0, 7), mark(2, 'sheriff')])).toThrow(GameRuleError);
  });

  it('отметку можно снять или перенести', () => {
    const s = replay(blind(), [
      adv,
      mark(1, 'mafia'),
      mark(1, 'civilian'),
      mark(2, 'mafia'),
      mark(6, 'mafia'),
      mark(8, 'mafia'),
      adv,
      mark(2, 'don'),
      mark(6, 'don'),
    ]);
    expect(s.seats[0]!.role).toBe('civilian');
    expect(s.seats[1]!.role).toBe('mafia');
    expect(s.seats[5]!.role).toBe('don');
  });

  it('без дона и шерифа в составе их шаги пропускаются', () => {
    const setup = blind(7);
    setup.composition = { civilian: 5, sheriff: 0, mafia: 2, don: 0 };
    const s = replay(setup, [adv, mark(2, 'mafia'), mark(5, 'mafia'), adv]);
    expect(s.phase).toEqual({ kind: 'speech', seat: 1, shortened: false });
  });

  it('после отметки роли работают в ночных проверках', () => {
    const s = replay(blind(), [...NIGHT0, ...Array<GameEvent>(10).fill(adv), { type: 'shoot', target: 1 }, { type: 'check', target: 4 }]);
    expect(s.nights[0]!.donCheck).toEqual({ target: 4, isSheriff: true });
  });
});
