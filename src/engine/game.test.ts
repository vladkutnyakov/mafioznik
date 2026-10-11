import { describe, expect, it } from 'vitest';
import {
  FIIM_REGULATION,
  GameRuleError,
  computeScores,
  createGame,
  describePhase,
  phaseDuration,
  replay,
  tryReplay,
  validateSetup,
  type GameEvent,
  type GameSetup,
  type Regulation,
  type Role,
} from './index';

// Рассадка для тестов: чёрные — 2, 6 (дон), 8; шериф — 4.
const ROLES: Role[] = ['civilian', 'mafia', 'civilian', 'sheriff', 'civilian', 'don', 'civilian', 'mafia', 'civilian', 'civilian'];

function setup(patch?: (r: Regulation) => void): GameSetup {
  const regulation = structuredClone(FIIM_REGULATION);
  patch?.(regulation);
  return { regulation, seats: ROLES.map((role, i) => ({ player: { nickname: `Игрок ${i + 1}` }, role })) };
}

const adv = (n = 1): GameEvent[] => Array.from({ length: n }, () => ({ type: 'advance' }) as const);
const nominate = (target: number): GameEvent => ({ type: 'nominate', target });
const vote = (...votes: number[]): GameEvent => ({ type: 'vote', votes });
const shoot = (target: number | null): GameEvent => ({ type: 'shoot', target });
const check = (target: number): GameEvent => ({ type: 'check', target });
const foul = (seat: number, times = 1): GameEvent[] => Array.from({ length: times }, () => ({ type: 'foul', seat }) as const);

/** Ночь 0 пройдена, идёт речь игрока №1 в День 1. */
const toDay1 = adv(3);

describe('создание игры', () => {
  it('проверяет состав ролей', () => {
    const bad = setup();
    bad.seats[0]!.role = 'mafia';
    expect(validateSetup(bad).length).toBeGreaterThan(0);
    expect(() => createGame(bad)).toThrow(GameRuleError);
    expect(validateSetup(setup())).toEqual([]);
  });

  it('начинается с договорки мафии и переходит к речам Дня 1', () => {
    const s0 = createGame(setup());
    expect(s0.phase).toEqual({ kind: 'night0', step: 'mafiaMeet' });
    expect(phaseDuration(s0.phase, s0.regulation)).toBe(60);
    const s = replay(setup(), toDay1);
    expect(s.day).toBe(1);
    expect(s.phase).toEqual({ kind: 'speech', seat: 1, shortened: false });
    expect(describePhase(s).title).toBe('День 1 · Речь №1');
  });
});

describe('речи и выставления', () => {
  it('идут по кругу с первого места в День 1', () => {
    const s = replay(setup(), [...toDay1, ...adv(9)]);
    expect(s.phase).toEqual({ kind: 'speech', seat: 10, shortened: false });
  });

  it('разрешают одно выставление за речь и запрещают повторное выставление', () => {
    const st = setup();
    expect(() => replay(st, [...toDay1, nominate(5), nominate(6)])).toThrow('уже выставил');
    expect(() => replay(st, [...toDay1, nominate(5), ...adv(), nominate(5)])).toThrow('уже выставлен');
    expect(() => replay(st, [nominate(3)])).toThrowError(GameRuleError); // ночью выставлять нельзя
    const s = replay(st, [...toDay1, nominate(5)]);
    expect(s.nominations).toEqual([{ day: 1, by: 1, target: 5 }]);
  });

  it('в День 1 при одной кандидатуре голосования нет', () => {
    const s = replay(setup(), [...toDay1, nominate(5), ...adv(10)]);
    expect(s.phase).toEqual({ kind: 'night', step: 'shoot' });
    expect(s.votes).toEqual([]);
  });

  it('без кандидатур сразу наступает ночь', () => {
    const s = replay(setup(), [...toDay1, ...adv(10)]);
    expect(s.phase).toEqual({ kind: 'night', step: 'shoot' });
  });
});

describe('полная игра: победа мирных', () => {
  const events: GameEvent[] = [
    // День 1: №1 выставляет №2, №3 выставляет №6.
    ...toDay1,
    nominate(2),
    ...adv(2),
    nominate(6),
    ...adv(8),
    vote(7), // №2 — 7 голосов, №6 — оставшиеся 3
    ...adv(), // прощальная речь №2 → ночь
    // Ночь 1: убит шериф №4, дон проверяет №4, шериф успевает проверить №6.
    shoot(4),
    check(4),
    check(6),
    ...adv(2), // утро → прощальная речь №4 → День 2
    // День 2 открывает №3 (№2 выбыл): №3 выставляет №6, №5 выставляет №8.
    nominate(6),
    ...adv(),
    nominate(8),
    ...adv(7),
    vote(6), // №6 — 6 голосов, №8 — 2
    ...adv(), // прощальная речь №6 → ночь
    // Ночь 2: промах. Дон и шериф выбыли, их проверки пропускаются.
    shoot(null),
    ...adv(), // утро → День 3
    // День 3 открывает №5: единственная кандидатура №8 уходит без голосования.
    nominate(8),
    ...adv(7),
    ...adv(), // прощальная речь №8 → конец игры
  ];

  it('даёт прощальную речь последнему чёрному перед завершением', () => {
    const s = replay(setup(), events.slice(0, -1));
    expect(s.result).toBeNull();
    expect(s.phase).toEqual({ kind: 'farewell', seat: 8, reason: 'voted' });
    expect(describePhase(s).prompt).toContain('Затем игра завершится: победа — Мирные.');
    expect(() => replay(setup(), [...events.slice(0, -1), { type: 'finish', winner: 'red' }])).not.toThrow();
  });

  it('доходит до победы красных', () => {
    const s = replay(setup(), events);
    expect(s.result).toEqual({ winner: 'red', reason: 'allBlacksOut' });
    expect(s.phase).toEqual({ kind: 'finished' });
    expect(s.votes.map((v) => v.votes)).toEqual([
      [7, 3],
      [6, 2],
    ]);
    expect(s.nights[0]).toEqual({
      night: 1,
      kill: 4,
      donCheck: { target: 4, isSheriff: true },
      sheriffCheck: { target: 6, isBlack: true },
    });
    expect(s.eliminations.map((e) => [e.seat, e.kind])).toEqual([
      [2, 'voted'],
      [4, 'killed'],
      [6, 'voted'],
      [8, 'voted'],
    ]);
  });

  it('определяет открывающего каждый день', () => {
    // 22 события: Ночь 0, День 1, Ночь 1, утро и прощальная речь №4.
    const day2 = replay(setup(), events.slice(0, 22));
    expect(day2.day).toBe(2);
    expect(day2.dayOpener).toBe(3);
    expect(day2.phase).toEqual({ kind: 'speech', seat: 3, shortened: false });
    const s = replay(setup(), events);
    expect(s.dayOpener).toBe(5);
  });

  it('пропускает проверки выбывших дона и шерифа', () => {
    const secondShoot = events.findIndex((e, i) => i > 17 && e.type === 'shoot');
    const s = replay(setup(), events.slice(0, secondShoot + 1));
    expect(s.phase).toEqual({ kind: 'morning', killed: null });
  });

  it('считает баллы с доп. баллами', () => {
    const s = replay(setup(), [...events, { type: 'setExtraPoints', seat: 1, value: 0.3 }]);
    const scores = computeScores(s)!;
    expect(scores[0]).toMatchObject({ seat: 1, won: true, base: 1, extra: 0.3, total: 1.3 });
    expect(scores[1]).toMatchObject({ seat: 2, won: false, total: 0 });
  });

  it('не принимает доп. баллы вне диапазона и до конца игры', () => {
    expect(() => replay(setup(), [...events, { type: 'setExtraPoints', seat: 1, value: 5 }])).toThrow('Доп. баллы');
    expect(() => replay(setup(), [...toDay1, { type: 'setExtraPoints', seat: 1, value: 0.1 }])).toThrow('после завершения');
  });
});

describe('голосование', () => {
  // №1 выставляет №2, №2 выставляет №3. Затем голосование.
  const toVote: GameEvent[] = [...toDay1, nominate(2), ...adv(), nominate(3), ...adv(9)];

  it('начисляет оставшиеся голоса последнему кандидату', () => {
    const s = replay(setup(), [...toVote, vote(3)]);
    expect(s.votes[0]!.votes).toEqual([3, 7]);
    expect(s.phase).toEqual({ kind: 'farewell', seat: 3, reason: 'voted' });
  });

  it('не принимает голосов больше, чем живых игроков', () => {
    expect(() => replay(setup(), [...toVote, vote(11)])).toThrow('больше, чем живых');
    expect(() => replay(setup(), [...toVote, vote(4, 4)])).toThrow('равна числу живых');
  });

  it('при попиле даёт оправдательные речи и переголосование', () => {
    let s = replay(setup(), [...toVote, vote(5)]);
    expect(s.phase).toEqual({ kind: 'tieSpeech', seat: 2 });
    expect(phaseDuration(s.phase, s.regulation)).toBe(30);
    s = replay(setup(), [...toVote, vote(5), ...adv(2)]);
    expect(s.phase).toEqual({ kind: 'voting', round: 'revote', candidates: [2, 3] });
    s = replay(setup(), [...toVote, vote(5), ...adv(2), vote(7)]);
    expect(s.phase).toEqual({ kind: 'farewell', seat: 2, reason: 'voted' });
  });

  it('при повторном попиле голосует за подъём всех: большинство поднимает обоих', () => {
    const base = [...toVote, vote(5), ...adv(2), vote(5)];
    let s = replay(setup(), base);
    expect(s.phase).toEqual({ kind: 'liftAllVote', candidates: [2, 3] });
    s = replay(setup(), [...base, { type: 'liftAllVote', votesFor: 6 }]);
    expect(s.seats[1]!.status).toBe('voted');
    expect(s.seats[2]!.status).toBe('voted');
    expect(s.phase).toEqual({ kind: 'farewell', seat: 2, reason: 'voted' });
    s = replay(setup(), [...base, { type: 'liftAllVote', votesFor: 6 }, ...adv(2)]);
    expect(s.phase).toEqual({ kind: 'night', step: 'shoot' });
  });

  it('половина голосов за подъём всех никого не поднимает', () => {
    const s = replay(setup(), [...toVote, vote(5), ...adv(2), vote(5), { type: 'liftAllVote', votesFor: 5 }]);
    expect(s.seats[1]!.status).toBe('alive');
    expect(s.phase).toEqual({ kind: 'night', step: 'shoot' });
  });

  it('при попиле двоих из трёх кандидатов переголосование идёт только между ними', () => {
    const three: GameEvent[] = [...toDay1, nominate(2), ...adv(), nominate(3), ...adv(), nominate(5), ...adv(8)];
    let s = replay(setup(), [...three, vote(4, 4)]); // 4-4-2
    expect(s.phase).toEqual({ kind: 'tieSpeech', seat: 2 });
    s = replay(setup(), [...three, vote(4, 4), ...adv(2), vote(5)]); // 5-5 среди тех же
    expect(s.phase).toEqual({ kind: 'liftAllVote', candidates: [2, 3] });
  });
});

describe('ночь и лучший ход', () => {
  const toNight1: GameEvent[] = [...toDay1, ...adv(10)];

  it('даёт лучший ход первому убитому и начисляет баллы', () => {
    let s = replay(setup(), [...toNight1, shoot(1), check(3), check(2), ...adv()]);
    expect(s.phase).toEqual({ kind: 'bestMove', seat: 1 });
    s = replay(setup(), [...toNight1, shoot(1), check(3), check(2), ...adv(), { type: 'bestMove', targets: [2, 6, 8] }]);
    expect(s.bestMove).toEqual({ seat: 1, targets: [2, 6, 8], blacks: 3 });
    expect(s.phase).toEqual({ kind: 'farewell', seat: 1, reason: 'killed' });
    s = replay(setup(), [
      ...toNight1,
      shoot(1),
      check(3),
      check(2),
      ...adv(),
      { type: 'bestMove', targets: [2, 6, 8] },
      { type: 'finish', winner: 'red' },
    ]);
    expect(computeScores(s)![0]).toMatchObject({ bestMove: 0.5, total: 1.5 });
  });

  it('за двух угаданных чёрных даёт 0,25', () => {
    const s = replay(setup(), [
      ...toNight1,
      shoot(1),
      check(3),
      check(2),
      ...adv(),
      { type: 'bestMove', targets: [2, 6, 3] },
      { type: 'finish', winner: 'black' },
    ]);
    expect(computeScores(s)![0]).toMatchObject({ bestMove: 0.25, base: 0, total: 0.25 });
  });

  it('не даёт лучший ход, если до отстрела кто-то уже выбыл', () => {
    const s = replay(setup(), [
      ...toDay1,
      nominate(2),
      ...adv(),
      nominate(3),
      ...adv(9),
      vote(3), // №3 уходит
      ...adv(),
      shoot(1),
      check(4),
      check(2),
      ...adv(),
    ]);
    expect(s.phase).toEqual({ kind: 'farewell', seat: 1, reason: 'killed' });
  });

  it('не даёт стрелять в выбывшего и требует результат стрельбы', () => {
    expect(() => replay(setup(), [...toNight1, ...adv()])).toThrow('результат стрельбы');
    expect(() => replay(setup(), [...toNight1, shoot(1), check(3), check(2), ...adv(3), ...adv(9), shoot(1)])).toThrow(
      'уже выбыл',
    );
  });

  it('убитый этой ночью шериф всё равно делает проверку', () => {
    const s = replay(setup(), [...toNight1, shoot(4), check(5)]);
    expect(s.phase).toEqual({ kind: 'night', step: 'sheriffCheck' });
  });
});

describe('фолы и удаления', () => {
  it('третий фол лишает ближайшей речи', () => {
    const s = replay(setup(), [...toDay1, ...foul(5, 3), ...adv(4)]);
    expect(s.seats[4]!.fouls).toBe(3);
    expect(s.phase).toEqual({ kind: 'speech', seat: 6, shortened: false });
    expect(s.seats[4]!.skipNextSpeech).toBe(false);
  });

  it('за малым столом третий фол даёт сокращённую речь', () => {
    const st = setup((r) => {
      r.fouls.smallTableAliveMax = 10;
    });
    const s = replay(st, [...toDay1, ...foul(5, 3), ...adv(4)]);
    expect(s.phase).toEqual({ kind: 'speech', seat: 5, shortened: true });
    expect(phaseDuration(s.phase, s.regulation)).toBe(30);
  });

  it('четвёртый фол удаляет игрока и отменяет голосование дня', () => {
    const s = replay(setup(), [...toDay1, nominate(2), ...adv(), nominate(3), ...foul(5, 4), ...adv(8)]);
    expect(s.seats[4]!.status).toBe('removed');
    expect(s.phase).toEqual({ kind: 'night', step: 'shoot' });
    expect(s.votes).toEqual([]);
  });

  it('удаление говорящего передаёт слово следующему', () => {
    const s = replay(setup(), [...toDay1, ...foul(1, 4)]);
    expect(s.phase).toEqual({ kind: 'speech', seat: 2, shortened: false });
  });

  it('удаление во время голосования отменяет голосование', () => {
    const s = replay(setup(), [...toDay1, nominate(2), ...adv(), nominate(3), ...adv(9), { type: 'disqualify', seat: 7 }]);
    expect(s.phase).toEqual({ kind: 'night', step: 'shoot' });
  });

  it('удаление за фолы штрафует в баллах', () => {
    const s = replay(setup(), [...toDay1, ...foul(5, 4), { type: 'finish', winner: 'red' }]);
    expect(computeScores(s)![4]).toMatchObject({ penalty: 0.5, total: 0.5 });
  });
});

describe('завершение игры', () => {
  it('мафия побеждает при равенстве после удалений', () => {
    const s = replay(setup(), [...toDay1, ...foul(1, 4), ...foul(3, 4), ...foul(5, 4), ...foul(7, 4)]);
    expect(s.result).toEqual({ winner: 'black', reason: 'blacksParity' });
  });

  it('мафия побеждает утром после отстрела: проверки и прощальная речь проходят', () => {
    // Удаляем №1, №3, №5 днём (голосования нет), ночью убивают №7: 3 красных против 3 чёрных.
    const base: GameEvent[] = [...toDay1, ...foul(1, 4), ...foul(3, 4), ...foul(5, 4), ...adv(7), shoot(7)];
    let s = replay(setup(), base);
    expect(s.phase).toEqual({ kind: 'night', step: 'donCheck' });
    s = replay(setup(), [...base, check(4), check(2)]);
    expect(s.phase).toEqual({ kind: 'morning', killed: 7 });
    expect(s.result).toBeNull();
    s = replay(setup(), [...base, check(4), check(2), ...adv()]);
    expect(s.phase).toEqual({ kind: 'farewell', seat: 7, reason: 'killed' });
    s = replay(setup(), [...base, check(4), check(2), ...adv(2)]);
    expect(s.result).toEqual({ winner: 'black', reason: 'blacksParity' });
  });

  it('удалённый игрок не получает прощальную речь, игра завершается сразу', () => {
    const s = replay(setup(), [...toDay1, ...foul(2, 4), ...foul(6, 4), { type: 'disqualify', seat: 8 }]);
    expect(s.result).toEqual({ winner: 'red', reason: 'allBlacksOut' });
  });

  it('ППК завершает игру победой другой команды и штрафует виновного', () => {
    const s = replay(setup(), [...toDay1, { type: 'ppk', seat: 2 }]);
    expect(s.result).toEqual({ winner: 'red', reason: 'ppk' });
    expect(computeScores(s)![1]).toMatchObject({ penalty: 0.7, total: -0.7 });
  });

  it('после завершения действия игры недоступны', () => {
    expect(() => replay(setup(), [...toDay1, { type: 'finish', winner: 'red' }, ...adv()])).toThrow('завершена');
  });
});

describe('журнал событий', () => {
  it('отмена — это пересчёт журнала без последнего события', () => {
    const events = [...toDay1, nominate(5)];
    const undone = replay(setup(), events.slice(0, -1));
    expect(undone).toEqual(replay(setup(), toDay1));
  });

  it('tryReplay указывает первое недопустимое событие', () => {
    const r = tryReplay(setup(), [...toDay1, nominate(5), nominate(6), ...adv()]);
    expect(r.failedAt).toBe(4);
    expect(r.error).toContain('уже выставил');
    expect(r.state.nominations).toHaveLength(1);
  });
});
