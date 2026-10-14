import { describe, expect, it } from 'vitest';
import {
  FIIM_REGULATION,
  computeScores,
  describePhase,
  extraRules,
  freeExtra,
  replay,
  withScoring,
  type GameEvent,
  type GameSetup,
  type Regulation,
  type Role,
  type ScoringSystem,
} from './index';

function table(roles: Role[], system: ScoringSystem = 'fiim', patch?: (r: Regulation) => void): GameSetup {
  const regulation = withScoring(structuredClone(FIIM_REGULATION), system);
  patch?.(regulation);
  return {
    regulation,
    composition: {
      civilian: roles.filter((r) => r === 'civilian').length,
      sheriff: roles.filter((r) => r === 'sheriff').length,
      mafia: roles.filter((r) => r === 'mafia').length,
      don: roles.filter((r) => r === 'don').length,
    },
    seats: roles.map((role, i) => ({ player: { nickname: `Игрок ${i + 1}` }, role })),
  };
}

const adv = (n = 1): GameEvent[] => Array.from({ length: n }, () => ({ type: 'advance' }) as const);
const disq = (...seats: number[]): GameEvent[] => seats.map((seat) => ({ type: 'disqualify', seat }) as const);
const extra = (seat: number, value: number): GameEvent => ({ type: 'setExtraPoints', seat, value });

// 7 игроков: мафия №2, дон №6, шериф №4.
const SEVEN: Role[] = ['civilian', 'mafia', 'civilian', 'sheriff', 'civilian', 'don', 'civilian'];
// 10 игроков: мафия №2 и №8, дон №6, шериф №4.
const TEN: Role[] = ['civilian', 'mafia', 'civilian', 'sheriff', 'civilian', 'don', 'civilian', 'mafia', 'civilian', 'civilian'];
// 8 игроков: мафия №2, дон №6, шериф №4.
const EIGHT: Role[] = ['civilian', 'mafia', 'civilian', 'sheriff', 'civilian', 'don', 'civilian', 'civilian'];

describe('трое за столом', () => {
  // День 1: удалены №1, №2, №3, №5, голосования нет. Ночью промах. День 2 открывает №4, живы №4, №6, №7.
  const toDay2: GameEvent[] = [...adv(3), ...disq(1, 2, 3, 5), ...adv(3), { type: 'shoot', target: null }, ...adv(3)];

  it('на голосование выставляются все живые, выставлять не нужно', () => {
    let s = replay(table(SEVEN), toDay2);
    expect(s.day).toBe(2);
    expect(s.phase).toEqual({ kind: 'speech', seat: 4, shortened: false });
    expect(() => replay(table(SEVEN), [...toDay2, { type: 'nominate', target: 6 }])).toThrow('выставляются все');
    s = replay(table(SEVEN), [...toDay2, ...adv(3)]);
    expect(s.phase).toEqual({ kind: 'voting', round: 'main', candidates: [4, 6, 7] });
    expect(describePhase(s).prompt).toContain('За столом трое');
  });

  it('голосование идёт по обычным правилам', () => {
    let s = replay(table(SEVEN), [...toDay2, ...adv(3), { type: 'vote', votes: [0, 3] }]);
    expect(s.phase).toEqual({ kind: 'farewell', seat: 6, reason: 'voted' });
    s = replay(table(SEVEN), [...toDay2, ...adv(3), { type: 'vote', votes: [1, 1] }]);
    expect(s.phase).toEqual({ kind: 'tieSpeech', seat: 4 });
  });

  it('в старых партиях без правила выставления как раньше', () => {
    const old = table(SEVEN, 'fiim', (r) => delete r.voting.allAliveVoteAt);
    const s = replay(old, [...toDay2, { type: 'nominate', target: 6 }, ...adv(3)]);
    expect(s.phase).toEqual({ kind: 'farewell', seat: 6, reason: 'voted' });
  });
});

describe('упрощённые баллы', () => {
  // Город побеждает: все чёрные дисквалифицированы в День 1.
  const redWins: GameEvent[] = [...adv(3), ...disq(2, 6, 8)];

  it('у каждого со старта один доп. балл, удаление — минус балл', () => {
    const s = replay(table(TEN, 'simple'), redWins);
    expect(extraRules(s)).toEqual({ start: 1, min: 0, max: 3, step: 1, total: 10 });
    const scores = computeScores(s)!;
    expect(scores[0]).toMatchObject({ base: 1, extra: 1, penalty: 0, total: 2 });
    expect(scores[1]).toMatchObject({ base: 0, extra: 1, penalty: 1, total: 0 });
  });

  it('балл забирают у одного игрока и отдают другому', () => {
    const st = table(TEN, 'simple');
    expect(() => replay(st, [...redWins, extra(1, 2)])).toThrow('Свободных доп. баллов нет');
    let s = replay(st, [...redWins, extra(3, 0)]);
    expect(freeExtra(s)).toBe(1);
    s = replay(st, [...redWins, extra(3, 0), extra(5, 0), extra(1, 2), extra(1, 3)]);
    expect(freeExtra(s)).toBe(0);
    expect(computeScores(s)![0]).toMatchObject({ extra: 3, total: 4 });
    expect(() => replay(st, [...redWins, extra(3, 0), extra(5, 0), extra(7, 0), extra(1, 4)])).toThrow('от 0 до 3');
    expect(() => replay(st, [...redWins, extra(3, 0), extra(1, 1.5)])).toThrow('целые');
  });

  it('за столом на 7–8 можно забрать балл только у одного', () => {
    const s = replay(table(EIGHT, 'simple'), [...adv(3), ...disq(2, 6)]);
    expect(extraRules(s)).toMatchObject({ max: 2, total: 8 });
  });

  it('лучший ход — балл за каждого угаданного чёрного', () => {
    // Речи Дня 1 без выставлений, ночью убит №1, проверки пропущены.
    const events: GameEvent[] = [...adv(3 + 10), { type: 'shoot', target: 1 }, ...adv(3)];
    const s = replay(table(TEN, 'simple'), [
      ...events,
      { type: 'bestMove', targets: [2, 6, 3] },
      { type: 'finish', winner: 'red' },
    ]);
    expect(computeScores(s)![0]).toMatchObject({ bestMove: 2, total: 1 + 1 + 2 });
  });
});

describe('лучший ход', () => {
  // Речи Дня 1 без выставлений, ночью убит №1, проверки пропущены: идёт лучший ход №1.
  const toBestMove = (players: number): GameEvent[] => [...adv(3 + players), { type: 'shoot', target: 1 }, ...adv(3)];
  const bestMove = (...targets: number[]): GameEvent => ({ type: 'bestMove', targets });

  it('за столом на 10 называют ровно три номера', () => {
    const st = table(TEN);
    expect(describePhase(replay(st, toBestMove(10))).prompt).toContain('назовите трёх игроков');
    expect(() => replay(st, [...toBestMove(10), bestMove(2, 6)])).toThrow('нужно назвать 3 номера');
    expect(replay(st, [...toBestMove(10), bestMove(2, 6, 8)]).bestMove?.blacks).toBe(3);
  });

  it('за столом с двумя чёрными называют два номера', () => {
    const st = table(EIGHT);
    expect(describePhase(replay(st, toBestMove(8))).prompt).toContain('назовите двух игроков');
    expect(() => replay(st, [...toBestMove(8), bestMove(2, 6, 3)])).toThrow('не больше 2 номеров');
    expect(replay(st, [...toBestMove(8), bestMove(2, 6)]).bestMove?.blacks).toBe(2);
  });

  it('называют только игроков за столом', () => {
    const st = table(TEN);
    const events = [...adv(3), ...disq(3), ...adv(9), { type: 'shoot', target: 1 } as const, ...adv(3)];
    // Удаление в День 1 — не смерть, поэтому лучший ход остаётся только при requireFirstDeath = false.
    const loose = table(TEN, 'fiim', (r) => (r.bestMove.requireFirstDeath = false));
    expect(replay(st, events).phase.kind).not.toBe('bestMove');
    expect(() => replay(loose, [...events, bestMove(2, 3, 6)])).toThrow('только игроков за столом');
  });

  it('в старых партиях можно назвать меньше трёх', () => {
    const old = table(TEN, 'fiim', (r) => delete r.bestMove.exact);
    expect(replay(old, [...toBestMove(10), bestMove(2)]).bestMove?.blacks).toBe(1);
  });
});

describe('без баллов', () => {
  it('баллы не считаются и не выставляются', () => {
    const events: GameEvent[] = [...adv(3), ...disq(2, 6, 8)];
    const s = replay(table(TEN, 'none'), events);
    expect(s.result?.winner).toBe('red');
    expect(computeScores(s)).toBeNull();
    expect(() => replay(table(TEN, 'none'), [...events, extra(1, 1)])).toThrow('не считаются');
  });
});

describe('выбор системы баллов', () => {
  it('ФИИМ по умолчанию и в старых партиях', () => {
    const old = structuredClone(FIIM_REGULATION);
    delete old.scoring.system;
    const s = replay(table(TEN, 'fiim', (r) => (r.scoring = old.scoring)), [...adv(3), ...disq(2, 6, 8)]);
    expect(extraRules(s)).toEqual({ start: 0, min: -1, max: 1, step: 0.1, total: null });
    expect(computeScores(s)![1]).toMatchObject({ penalty: 0.5 });
  });

  it('переключение обратно на ФИИМ возвращает баллы ФИИМ', () => {
    const r = withScoring(withScoring(FIIM_REGULATION, 'simple'), 'fiim');
    expect(r.scoring).toEqual(FIIM_REGULATION.scoring);
    expect(r.bestMove).toEqual(FIIM_REGULATION.bestMove);
  });
});
