// Базовые типы движка игры. Движок не зависит от интерфейса и хранилища.

export type Role = 'civilian' | 'sheriff' | 'mafia' | 'don';
export type Team = 'red' | 'black';

export const ROLE_TEAM: Record<Role, Team> = {
  civilian: 'red',
  sheriff: 'red',
  mafia: 'black',
  don: 'black',
};

export const ROLE_COUNTS: Record<Role, number> = {
  civilian: 6,
  sheriff: 1,
  mafia: 2,
  don: 1,
};

/** Стандартный стол. Число игроков в конкретной игре берётся из рассадки. */
export const SEAT_COUNT = 10;
export const MIN_SEATS = 7;
export const MAX_SEATS = 10;

/** Состав ролей: сколько игроков каждой роли за столом. */
export type Composition = Record<Role, number>;

/**
 * Система подсчёта баллов.
 * fiim — баллы ФИИМ: доп. баллы ведущего дробные, штрафы из регламента.
 * simple — клубная: у каждого со старта один доп. балл, хороший игрок забирает его у плохого.
 * none — баллы не считаются.
 */
export type ScoringSystem = 'fiim' | 'simple' | 'none';

/** Регламент: все настраиваемые правила игры. */
export interface Regulation {
  id: string;
  name: string;
  /** Длительности в секундах. */
  timings: {
    speech: number;
    /** Сокращённая речь, например после 3-го фола за малым столом. */
    shortSpeech: number;
    tieSpeech: number;
    farewell: number;
    mafiaMeet: number;
    donMeet: number;
    sheriffMeet: number;
    nightCheck: number;
    /** За сколько секунд до конца звучит предупреждение. */
    warningAt: number;
  };
  nominations: {
    perSpeech: number;
    allowSelf: boolean;
  };
  voting: {
    /** В День 1 при единственной кандидатуре голосование не проводится. */
    firstDaySingleCandidateNoVote: boolean;
    /** Со Дня 2 единственный кандидат покидает стол без голосования. */
    singleCandidateAutoEliminate: boolean;
    /** Если днём удалён игрок, голосование в этот день не проводится. */
    noVoteAfterDayRemoval: boolean;
    /**
     * При стольких живых и меньше на голосование выставляются все живые, выставления в речах не нужны.
     * Нет в старых партиях: там правило выключено.
     */
    allAliveVoteAt?: number;
  };
  /**
   * Ничья, если столько ночей подряд число игроков за столом не менялось (никто не выбыл ни ночью, ни днём).
   * Нет в старых партиях: там правило выключено.
   */
  drawAfterQuietNights?: number;
  fouls: {
    /** На каком фоле игрок пропускает ближайшую речь. */
    skipSpeechAt: number;
    /** На каком фоле игрок удаляется. */
    removeAt: number;
    /** При стольких живых и меньше пропуск речи заменяется сокращённой речью. */
    smallTableAliveMax: number;
  };
  bestMove: {
    enabled: boolean;
    /** ЛХ только если отстрел в Ночь 1 стал первым выбыванием в игре. */
    requireFirstDeath: boolean;
    /**
     * Называют ровно столько живых игроков, сколько чёрных в составе, но не больше трёх.
     * Нет в старых партиях: там можно назвать до трёх любых номеров.
     */
    exact?: boolean;
    /** Баллы по числу угаданных чёрных: индекс = количество (0–3). */
    pointsByBlacks: [number, number, number, number];
  };
  scoring: {
    /** Нет в старых партиях: там баллы ФИИМ. */
    system?: ScoringSystem;
    win: number;
    loss: number;
    extraMin: number;
    extraMax: number;
    extraStep: number;
    /** Штрафы указываются положительными числами и вычитаются. */
    removalPenalty: number;
    disqualificationPenalty: number;
    ppkPenalty: number;
  };
}

export interface PlayerRef {
  id?: string;
  nickname: string;
}

export interface SeatSetup {
  player: PlayerRef;
  /**
   * Роль, если она известна до начала игры (старые партии).
   * Обычно не указывается: ведущий отмечает роли в Ночь 0, когда игроки просыпаются.
   */
  role?: Role;
}

/** Турнир: серия игр с подсчётом баллов. Обычная игра идёт без турнира и без баллов. */
export interface TournamentInfo {
  id: string;
  name: string;
  /** Ник ведущего. */
  host: string;
  /** Сколько игр в турнире. */
  games: number;
  /** Номер этой игры в турнире, начиная с 1. */
  game: number;
}

export interface GameSetup {
  regulation: Regulation;
  /** Нет у обычных игр и старых партий. */
  tournament?: TournamentInfo;
  /** Места по порядку: индекс 0 = место №1. */
  seats: SeatSetup[];
  /** Состав ролей. Если не указан (старые партии), это стандарт на 10 игроков. */
  composition?: Composition;
}

export type SeatStatus = 'alive' | 'killed' | 'voted' | 'removed';

export interface SeatState {
  seat: number;
  player: PlayerRef;
  /** До отметки в Ночь 0 у всех стоит «мирный»: неотмеченные игроки им и остаются. */
  role: Role;
  status: SeatStatus;
  fouls: number;
  skipNextSpeech: boolean;
}

export type NightStep = 'shoot' | 'donCheck' | 'sheriffCheck';
/** deal — ведущий раздаёт карты, игроки спят. На остальных шагах ведущий отмечает проснувшихся. */
export type Night0Step = 'deal' | 'mafiaMeet' | 'donMeet' | 'sheriffMeet';

export type Phase =
  | { kind: 'night0'; step: Night0Step }
  | { kind: 'speech'; seat: number; shortened: boolean }
  | { kind: 'voting'; round: 'main' | 'revote'; candidates: number[] }
  | { kind: 'tieSpeech'; seat: number }
  | { kind: 'liftAllVote'; candidates: number[] }
  | { kind: 'farewell'; seat: number; reason: 'killed' | 'voted' }
  | { kind: 'night'; step: NightStep }
  | { kind: 'morning'; killed: number | null }
  | { kind: 'bestMove'; seat: number }
  | { kind: 'finished' };

export type PhaseKind = Phase['kind'];

/** Элементы очереди: готовые фазы или маркеры, которые раскрываются в момент наступления. */
export type QueueItem =
  | Phase
  | { kind: 'startDay' }
  | { kind: 'endSpeeches' }
  | { kind: 'startNight' }
  | { kind: 'endNight' }
  /** Исход решён, игра завершается после прощальных речей. */
  | { kind: 'finishGame'; winner: Team | null; reason: FinishReason };

export type EliminationKind = 'killed' | 'voted' | 'removed';

export interface Elimination {
  seat: number;
  day: number;
  kind: EliminationKind;
}

export interface Nomination {
  day: number;
  by: number;
  target: number;
}

export interface VoteRecord {
  day: number;
  round: 'main' | 'revote';
  candidates: number[];
  /** Голоса по кандидатам, включая автоматически начисленные последнему. */
  votes: number[];
}

export interface LiftAllRecord {
  day: number;
  candidates: number[];
  votesFor: number;
  lifted: boolean;
}

export interface NightRecord {
  night: number;
  /** Сколько игроков было за столом, когда наступила ночь. */
  alive: number;
  kill: number | null;
  donCheck?: { target: number; isSheriff: boolean };
  sheriffCheck?: { target: number; isBlack: boolean };
}

export interface FoulRecord {
  seat: number;
  day: number;
  phase: PhaseKind;
}

export type SanctionKind = 'removal' | 'disqualification' | 'ppk';

export interface Sanction {
  seat: number;
  day: number;
  kind: SanctionKind;
}

export interface BestMoveRecord {
  seat: number;
  targets: number[];
  blacks: number;
}

export type FinishReason = 'allBlacksOut' | 'blacksParity' | 'quietNights' | 'ppk' | 'manual';

export interface GameResult {
  /** null — ничья. */
  winner: Team | null;
  reason: FinishReason;
}

export interface GameState {
  regulation: Regulation;
  composition: Composition;
  seats: SeatState[];
  phase: Phase;
  queue: QueueItem[];
  /** Номер текущего дня. Ночь N идёт после Дня N. Ночь 0 соответствует day = 0. */
  day: number;
  /** Игрок, открывавший текущий (или последний) день. */
  dayOpener: number | null;
  /** В текущий день был удалён игрок. */
  dayRemoval: boolean;
  nominations: Nomination[];
  votes: VoteRecord[];
  liftAllVotes: LiftAllRecord[];
  nights: NightRecord[];
  eliminations: Elimination[];
  fouls: FoulRecord[];
  sanctions: Sanction[];
  bestMove: BestMoveRecord | null;
  extraPoints: Record<number, number>;
  result: GameResult | null;
}

/** Действия ведущего. Журнал этих событий полностью определяет состояние игры. */
export type GameEvent =
  | { type: 'advance' }
  /** Ночь 0: ведущий отмечает роль проснувшегося игрока. Какие роли можно ставить, зависит от шага. */
  | { type: 'setRole'; seat: number; role: Role }
  | { type: 'nominate'; target: number }
  /** Снять ошибочное выставление: во время речей или до ввода голосов основного голосования. */
  | { type: 'cancelNomination'; target: number }
  /** Голоса по кандидатам в порядке выставления. Можно не указывать последнего: ему уйдут оставшиеся голоса. */
  | { type: 'vote'; votes: number[] }
  | { type: 'liftAllVote'; votesFor: number }
  | { type: 'shoot'; target: number | null }
  | { type: 'check'; target: number }
  | { type: 'bestMove'; targets: number[] }
  | { type: 'foul'; seat: number }
  | { type: 'disqualify'; seat: number }
  | { type: 'ppk'; seat: number }
  | { type: 'finish'; winner: Team }
  | { type: 'setExtraPoints'; seat: number; value: number }
  /** Поменять тайминги посреди игры. */
  | { type: 'setTimings'; timings: Regulation['timings'] };
