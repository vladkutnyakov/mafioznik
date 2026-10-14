import { MAX_SEATS, MIN_SEATS, ROLE_COUNTS, type Composition, type Regulation, type ScoringSystem } from './types';

/**
 * Базовый регламент по правилам ФИИМ.
 * Значения баллов и штрафов стартовые, их нужно сверить с ведущим клуба (ТЗ, раздел 2.8).
 */
export const FIIM_REGULATION: Regulation = {
  id: 'fiim-basic',
  name: 'ФИИМ (базовый)',
  timings: {
    speech: 60,
    shortSpeech: 30,
    tieSpeech: 30,
    farewell: 60,
    mafiaMeet: 60,
    donMeet: 10,
    sheriffMeet: 10,
    nightCheck: 10,
    warningAt: 10,
  },
  nominations: {
    perSpeech: 1,
    allowSelf: true,
  },
  voting: {
    firstDaySingleCandidateNoVote: true,
    singleCandidateAutoEliminate: true,
    noVoteAfterDayRemoval: true,
    allAliveVoteAt: 3,
  },
  fouls: {
    skipSpeechAt: 3,
    removeAt: 4,
    smallTableAliveMax: 4,
  },
  bestMove: {
    enabled: true,
    requireFirstDeath: true,
    exact: true,
    pointsByBlacks: [0, 0, 0.25, 0.5],
  },
  scoring: {
    system: 'fiim',
    win: 1,
    loss: 0,
    extraMin: -1,
    extraMax: 1,
    extraStep: 0.1,
    removalPenalty: 0.5,
    disqualificationPenalty: 0.5,
    ppkPenalty: 0.7,
  },
};

export type Timings = Regulation['timings'];

// ---------- системы баллов ----------

export const SCORING_SYSTEMS: { id: ScoringSystem; label: string; hint: string }[] = [
  { id: 'fiim', label: 'ФИИМ', hint: 'Доп. баллы от −1 до +1, ЛХ +0,25 и +0,5, штрафы за удаление и ППК' },
  { id: 'simple', label: 'Упрощённые', hint: 'У каждого 1 доп. балл, хороший игрок забирает его у плохого' },
  { id: 'none', label: 'Без баллов', hint: 'Только победившая команда' },
];

export const scoringSystem = (reg: Regulation): ScoringSystem => reg.scoring.system ?? 'fiim';

/** Регламент с выбранной системой баллов. Остальные правила не меняются. */
export function withScoring(reg: Regulation, system: ScoringSystem): Regulation {
  if (system === 'simple') {
    return {
      ...reg,
      // За ЛХ — по баллу за каждого угаданного чёрного.
      bestMove: { ...reg.bestMove, pointsByBlacks: [0, 1, 2, 3] },
      // Предел доп. баллов зависит от числа игроков, его считает extraRules.
      scoring: {
        system,
        win: 1,
        loss: 0,
        extraMin: 0,
        extraMax: 3,
        extraStep: 1,
        removalPenalty: 1,
        disqualificationPenalty: 1,
        ppkPenalty: 1,
      },
    };
  }
  const fiim = FIIM_REGULATION;
  return { ...reg, bestMove: { ...reg.bestMove, pointsByBlacks: fiim.bestMove.pointsByBlacks }, scoring: { ...fiim.scoring, system } };
}

/** Описание настроек таймингов: подпись, допустимые значения, шаг для кнопок. */
export interface TimingField {
  key: keyof Timings;
  label: string;
  hint?: string;
  group: 'day' | 'night' | 'signal';
  min: number;
  max: number;
  step: number;
}

export const TIMING_FIELDS: TimingField[] = [
  { key: 'speech', label: 'Речь игрока', group: 'day', min: 10, max: 300, step: 5 },
  { key: 'tieSpeech', label: 'Оправдательная речь', hint: 'При попиле', group: 'day', min: 5, max: 300, step: 5 },
  { key: 'farewell', label: 'Прощальная речь', group: 'day', min: 10, max: 300, step: 5 },
  { key: 'shortSpeech', label: 'Сокращённая речь', hint: 'Третий фол за малым столом', group: 'day', min: 5, max: 300, step: 5 },
  { key: 'mafiaMeet', label: 'Договорка мафии', hint: 'Ночь 0. 0 — без таймера', group: 'night', min: 0, max: 300, step: 5 },
  { key: 'donMeet', label: 'Знакомство дона', hint: 'Ночь 0. 0 — без таймера', group: 'night', min: 0, max: 120, step: 5 },
  { key: 'sheriffMeet', label: 'Шериф смотрит на город', hint: 'Ночь 0. 0 — без таймера', group: 'night', min: 0, max: 120, step: 5 },
  { key: 'nightCheck', label: 'Проверки дона и шерифа', hint: '0 — без таймера', group: 'night', min: 0, max: 120, step: 5 },
  { key: 'warningAt', label: 'Сигнал до конца речи', hint: 'За сколько секунд. 0 — без сигнала', group: 'signal', min: 0, max: 60, step: 5 },
];

/** Ошибки в таймингах. Пустой список — всё в порядке. */
export function validateTimings(t: Timings): string[] {
  const errors: string[] = [];
  for (const f of TIMING_FIELDS) {
    const v = t[f.key];
    if (!Number.isInteger(v) || v < f.min || v > f.max) {
      errors.push(`${f.label}: нужно целое число секунд от ${f.min} до ${f.max}.`);
    }
  }
  return errors;
}

// ---------- состав ролей ----------

/** Составы по умолчанию для каждого числа игроков. Ведущий может их поменять. */
export const COMPOSITION_PRESETS: Record<number, Composition> = {
  7: { civilian: 4, sheriff: 1, mafia: 1, don: 1 },
  8: { civilian: 5, sheriff: 1, mafia: 1, don: 1 },
  9: { civilian: 5, sheriff: 1, mafia: 2, don: 1 },
  10: { ...ROLE_COUNTS },
};

export function compositionFor(players: number): Composition {
  return { ...(COMPOSITION_PRESETS[players] ?? ROLE_COUNTS) };
}

export const compositionSize = (c: Composition) => c.civilian + c.sheriff + c.mafia + c.don;
export const compositionReds = (c: Composition) => c.civilian + c.sheriff;
export const compositionBlacks = (c: Composition) => c.mafia + c.don;

/** Ошибки в составе ролей для стола из players игроков. */
export function validateComposition(c: Composition, players: number): string[] {
  const errors: string[] = [];
  if (players < MIN_SEATS || players > MAX_SEATS) {
    errors.push(`За столом может быть от ${MIN_SEATS} до ${MAX_SEATS} игроков, сейчас ${players}.`);
  }
  const roles = Object.values(c);
  if (roles.some((n) => !Number.isInteger(n) || n < 0)) errors.push('Число игроков каждой роли — целое неотрицательное.');
  const total = compositionSize(c);
  if (total !== players) errors.push(`В составе ${total} ролей, а игроков ${players}.`);
  if (c.sheriff > 1) errors.push('Шериф может быть только один.');
  if (c.don > 1) errors.push('Дон может быть только один.');
  if (c.civilian < 1) errors.push('Нужен хотя бы один мирный житель.');
  if (compositionBlacks(c) < 1) errors.push('Нужен хотя бы один чёрный игрок.');
  if (compositionReds(c) <= compositionBlacks(c)) {
    errors.push('Красных должно быть больше, чем чёрных, иначе мафия победит сразу.');
  }
  return errors;
}
