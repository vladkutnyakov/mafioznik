import type { Regulation } from './types';

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
  },
  fouls: {
    skipSpeechAt: 3,
    removeAt: 4,
    smallTableAliveMax: 4,
  },
  bestMove: {
    enabled: true,
    requireFirstDeath: true,
    pointsByBlacks: [0, 0, 0.25, 0.5],
  },
  scoring: {
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
