import { describe, expect, it } from 'vitest';
import {
  FIIM_REGULATION,
  compositionFor,
  createGame,
  describePhase,
  replay,
  validateComposition,
  validateSetup,
  type Composition,
  type GameEvent,
  type GameSetup,
  type Role,
} from './index';

function table(roles: Role[], composition?: Composition): GameSetup {
  return {
    regulation: FIIM_REGULATION,
    composition: composition ?? compositionFor(roles.length),
    seats: roles.map((role, i) => ({ player: { nickname: `Игрок ${i + 1}` }, role })),
  };
}

const adv = (n = 1): GameEvent[] => Array.from({ length: n }, () => ({ type: 'advance' }) as const);
const foul = (seat: number, times = 4): GameEvent[] =>
  Array.from({ length: times }, () => ({ type: 'foul', seat }) as const);

// 8 игроков: 5 мирных, шериф №4, мафия №2, дон №6.
const EIGHT: Role[] = ['civilian', 'mafia', 'civilian', 'sheriff', 'civilian', 'don', 'civilian', 'civilian'];

describe('состав ролей', () => {
  it('готовые составы проходят проверку', () => {
    for (const n of [7, 8, 9, 10]) expect(validateComposition(compositionFor(n), n)).toEqual([]);
  });

  it('ловит ошибки состава', () => {
    expect(validateComposition({ civilian: 4, sheriff: 1, mafia: 1, don: 1 }, 8)).toContain('В составе 7 ролей, а игроков 8.');
    expect(validateComposition({ civilian: 3, sheriff: 0, mafia: 3, don: 1 }, 7).join(' ')).toContain('Красных должно быть больше');
    expect(validateComposition({ civilian: 4, sheriff: 1, mafia: 0, don: 2 }, 7)).toContain('Дон может быть только один.');
    expect(validateComposition({ civilian: 3, sheriff: 1, mafia: 1, don: 1 }, 6).join(' ')).toContain('от 7 до 10');
  });

  it('рассадка должна совпадать с выбранным составом', () => {
    expect(validateSetup(table(EIGHT))).toEqual([]);
    const wrong = table(EIGHT, { civilian: 4, sheriff: 1, mafia: 2, don: 1 });
    expect(validateSetup(wrong)).toContain('Роль «Мирный»: нужно 4, сейчас 5.');
    // Без состава действует стандарт на 10 игроков.
    expect(validateSetup({ ...table(EIGHT), composition: undefined }).length).toBeGreaterThan(0);
  });
});

describe('стол на 8 игроков', () => {
  it('речи идут по кругу из 8 мест', () => {
    let s = replay(table(EIGHT), adv(3 + 7));
    expect(s.phase).toEqual({ kind: 'speech', seat: 8, shortened: false });
    s = replay(table(EIGHT), adv(3 + 8));
    expect(s.phase).toEqual({ kind: 'night', step: 'shoot' });
  });

  it('второй день открывает следующий игрок по кругу из 8', () => {
    const s = replay(table(EIGHT), [...adv(3 + 8), { type: 'shoot', target: null }, ...adv(3)]);
    expect(s.day).toBe(2);
    expect(s.phase).toEqual({ kind: 'speech', seat: 2, shortened: false });
  });

  it('нет места №9', () => {
    expect(() => replay(table(EIGHT), [...adv(3), { type: 'nominate', target: 9 }])).toThrow('Нет места №9');
  });

  it('мафия побеждает при равенстве 2 на 2', () => {
    const s = replay(table(EIGHT), [...adv(3), ...foul(1), ...foul(3), ...foul(5), ...foul(7)]);
    expect(s.result).toEqual({ winner: 'black', reason: 'blacksParity' });
  });

  it('город побеждает, когда оба чёрных выбыли', () => {
    const s = replay(table(EIGHT), [...adv(3), { type: 'disqualify', seat: 2 }, { type: 'disqualify', seat: 6 }]);
    expect(s.result).toEqual({ winner: 'red', reason: 'allBlacksOut' });
  });

  it('сохраняет состав в состоянии игры', () => {
    expect(createGame(table(EIGHT)).composition).toEqual({ civilian: 5, sheriff: 1, mafia: 1, don: 1 });
  });
});

describe('состав без дона или шерифа', () => {
  // 7 игроков: 4 мирных, шериф №4, две мафии №2 и №6, дона нет.
  const NO_DON: Role[] = ['civilian', 'mafia', 'civilian', 'sheriff', 'civilian', 'mafia', 'civilian'];
  const noDon = table(NO_DON, { civilian: 4, sheriff: 1, mafia: 2, don: 0 });

  it('фазы дона пропускаются целиком', () => {
    let s = replay(noDon, adv(1));
    expect(s.phase).toEqual({ kind: 'night0', step: 'sheriffMeet' });
    expect(describePhase(s).prompt).toBe('Мафия засыпает. Шериф просыпается и смотрит на город.');
    s = replay(noDon, [...adv(2 + 7), { type: 'shoot', target: 1 }]);
    expect(s.phase).toEqual({ kind: 'night', step: 'sheriffCheck' });
  });

  it('без шерифа пропускаются фазы шерифа', () => {
    const roles: Role[] = ['civilian', 'mafia', 'civilian', 'civilian', 'civilian', 'don', 'civilian'];
    const noSheriff = table(roles, { civilian: 5, sheriff: 0, mafia: 1, don: 1 });
    let s = replay(noSheriff, adv(2));
    expect(s.day).toBe(1);
    expect(s.phase).toEqual({ kind: 'speech', seat: 1, shortened: false });
    s = replay(noSheriff, [...adv(2 + 7), { type: 'shoot', target: 1 }, { type: 'check', target: 3 }]);
    expect(s.phase).toEqual({ kind: 'morning', killed: 1 });
  });
});
