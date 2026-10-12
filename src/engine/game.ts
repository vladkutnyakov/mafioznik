import { ROLE_NAMES, describePhase } from './labels';
import { validateTimings } from './regulation';
import {
  actsTonight,
  aliveByTeam,
  aliveCount,
  currentCandidates,
  currentNight,
  isAlive,
  isDayPhase,
  nightCheckerActive,
  nominatedBy,
  seatOf,
  seatsFrom,
  teamOf,
} from './selectors';
import {
  ROLE_COUNTS,
  SEAT_COUNT,
  type FinishReason,
  type GameEvent,
  type GameResult,
  type GameSetup,
  type GameState,
  type Phase,
  type QueueItem,
  type Role,
  type Team,
} from './types';

/** Ошибка правил: действие ведущего недопустимо в текущем состоянии. */
export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameRuleError';
  }
}

function fail(message: string): never {
  throw new GameRuleError(message);
}

// ---------------------------------------------------------------------------
// Создание игры
// ---------------------------------------------------------------------------

export function validateSetup(setup: GameSetup): string[] {
  const errors: string[] = [];
  if (setup.seats.length !== SEAT_COUNT) {
    errors.push(`Нужно ровно ${SEAT_COUNT} игроков, сейчас ${setup.seats.length}.`);
  }
  for (const role of Object.keys(ROLE_COUNTS) as Role[]) {
    const n = setup.seats.filter((s) => s.role === role).length;
    if (n !== ROLE_COUNTS[role]) {
      errors.push(`Роль «${ROLE_NAMES[role]}»: нужно ${ROLE_COUNTS[role]}, сейчас ${n}.`);
    }
  }
  setup.seats.forEach((s, i) => {
    if (!s.player.nickname.trim()) errors.push(`Место №${i + 1}: не указан игрок.`);
  });
  const ids = setup.seats.map((s) => s.player.id).filter((id): id is string => Boolean(id));
  if (new Set(ids).size !== ids.length) errors.push('Один игрок посажен на несколько мест.');
  errors.push(...validateTimings(setup.regulation.timings));
  return errors;
}

export function createGame(setup: GameSetup): GameState {
  const errors = validateSetup(setup);
  if (errors.length) fail(errors.join(' '));
  return {
    regulation: structuredClone(setup.regulation),
    seats: setup.seats.map((s, i) => ({
      seat: i + 1,
      player: { ...s.player },
      role: s.role,
      status: 'alive',
      fouls: 0,
      skipNextSpeech: false,
    })),
    phase: { kind: 'night0', step: 'mafiaMeet' },
    queue: [
      { kind: 'night0', step: 'donMeet' },
      { kind: 'night0', step: 'sheriffMeet' },
      { kind: 'startDay' },
    ],
    day: 0,
    dayOpener: null,
    dayRemoval: false,
    nominations: [],
    votes: [],
    liftAllVotes: [],
    nights: [],
    eliminations: [],
    fouls: [],
    sanctions: [],
    bestMove: null,
    extraPoints: {},
    result: null,
  };
}

// ---------------------------------------------------------------------------
// Применение событий
// ---------------------------------------------------------------------------

export function applyEvent(prev: GameState, event: GameEvent): GameState {
  const s = structuredClone(prev);
  if (s.result && event.type !== 'setExtraPoints') fail('Игра уже завершена.');

  switch (event.type) {
    case 'advance':
      onAdvance(s);
      break;
    case 'nominate':
      onNominate(s, event.target);
      break;
    case 'cancelNomination':
      onCancelNomination(s, event.target);
      break;
    case 'vote':
      onVote(s, event.votes);
      break;
    case 'liftAllVote':
      onLiftAllVote(s, event.votesFor);
      break;
    case 'shoot':
      onShoot(s, event.target);
      break;
    case 'check':
      onCheck(s, event.target);
      break;
    case 'bestMove':
      onBestMove(s, event.targets);
      break;
    case 'foul':
      onFoul(s, event.seat);
      break;
    case 'disqualify':
      onDisqualify(s, event.seat);
      break;
    case 'ppk':
      onPpk(s, event.seat);
      break;
    case 'finish':
      finish(s, event.winner, 'manual');
      break;
    case 'setExtraPoints':
      onSetExtraPoints(s, event.seat, event.value);
      break;
  }
  return s;
}

/** Состояние игры по журналу событий. Бросает GameRuleError на первом недопустимом событии. */
export function replay(setup: GameSetup, events: readonly GameEvent[]): GameState {
  return events.reduce(applyEvent, createGame(setup));
}

export interface ReplayResult {
  state: GameState;
  /** Индекс первого недопустимого события, если оно есть. */
  failedAt: number | null;
  error: string | null;
}

/** Мягкий вариант replay: останавливается на первом недопустимом событии. Нужен для правки журнала. */
export function tryReplay(setup: GameSetup, events: readonly GameEvent[]): ReplayResult {
  let state = createGame(setup);
  for (let i = 0; i < events.length; i++) {
    try {
      state = applyEvent(state, events[i]!);
    } catch (e) {
      if (e instanceof GameRuleError) return { state, failedAt: i, error: e.message };
      throw e;
    }
  }
  return { state, failedAt: null, error: null };
}

/** Определяет победителя по текущему составу. */
export function winnerNow(s: GameState): GameResult | null {
  const alive = aliveByTeam(s);
  if (alive.black === 0) return { winner: 'red', reason: 'allBlacksOut' };
  if (alive.black >= alive.red) return { winner: 'black', reason: 'blacksParity' };
  return null;
}

// ---------------------------------------------------------------------------
// Обработчики событий
// ---------------------------------------------------------------------------

function phaseError(s: GameState): never {
  fail(`Действие недоступно сейчас: ${describePhase(s).title}.`);
}

function checkSeatNumber(seat: number): void {
  if (!Number.isInteger(seat) || seat < 1 || seat > SEAT_COUNT) fail(`Нет места №${seat}.`);
}

function onAdvance(s: GameState): void {
  const p = s.phase;
  if (p.kind === 'voting') fail('Сначала введите результаты голосования.');
  if (p.kind === 'liftAllVote') fail('Сначала введите результат голосования за подъём всех.');
  if (p.kind === 'night' && p.step === 'shoot') fail('Сначала введите результат стрельбы.');
  popNext(s);
}

function onNominate(s: GameState, target: number): void {
  const p = s.phase;
  if (p.kind !== 'speech') phaseError(s);
  checkSeatNumber(target);
  const reg = s.regulation.nominations;
  if (!isAlive(seatOf(s, target))) fail(`Игрок №${target} уже выбыл.`);
  if (!reg.allowSelf && target === p.seat) fail('Нельзя выставить себя.');
  if (currentCandidates(s).includes(target)) fail(`Игрок №${target} уже выставлен.`);
  if (nominatedBy(s, p.seat).length >= reg.perSpeech) fail(`Игрок №${p.seat} уже выставил кандидатуру.`);
  s.nominations.push({ day: s.day, by: p.seat, target });
}

function onCancelNomination(s: GameState, target: number): void {
  const p = s.phase;
  const allowed = p.kind === 'speech' || (p.kind === 'voting' && p.round === 'main');
  if (!allowed) fail('Снять выставление можно только во время речей или до начала голосования.');
  checkSeatNumber(target);
  const idx = s.nominations.findIndex((n) => n.day === s.day && n.target === target);
  if (idx < 0) fail(`Игрок №${target} не выставлен.`);
  s.nominations.splice(idx, 1);
  if (p.kind === 'voting') {
    // Состав голосования изменился: заново решаем, нужно ли голосование.
    s.queue = [{ kind: 'endSpeeches' }];
    popNext(s);
  }
}

function onVote(s: GameState, votes: number[]): void {
  const p = s.phase;
  if (p.kind !== 'voting') phaseError(s);
  const alive = aliveCount(s);
  const n = p.candidates.length;
  if (votes.length !== n && votes.length !== n - 1) {
    fail(`Нужно ввести голоса за ${n} кандидатов или за всех, кроме последнего.`);
  }
  if (votes.some((v) => !Number.isInteger(v) || v < 0)) fail('Голоса должны быть целыми неотрицательными числами.');
  const sum = votes.reduce((a, b) => a + b, 0);
  if (sum > alive) fail(`Голосов больше, чем живых игроков (${alive}).`);
  if (votes.length === n && sum !== alive) fail(`Сумма голосов должна быть равна числу живых игроков (${alive}).`);
  const full = votes.length === n ? [...votes] : [...votes, alive - sum];

  s.votes.push({ day: s.day, round: p.round, candidates: [...p.candidates], votes: full });

  const max = Math.max(...full);
  const leaders = p.candidates.filter((_, i) => full[i] === max);
  if (leaders.length === 1) {
    eliminateByVote(s, leaders);
  } else if (p.round === 'revote' && sameSet(leaders, p.candidates)) {
    s.queue.unshift({ kind: 'liftAllVote', candidates: leaders });
  } else {
    s.queue.unshift(
      ...leaders.map((seat): QueueItem => ({ kind: 'tieSpeech', seat })),
      { kind: 'voting', round: 'revote', candidates: leaders },
    );
  }
  popNext(s);
}

function onLiftAllVote(s: GameState, votesFor: number): void {
  const p = s.phase;
  if (p.kind !== 'liftAllVote') phaseError(s);
  const alive = aliveCount(s);
  if (!Number.isInteger(votesFor) || votesFor < 0 || votesFor > alive) {
    fail(`Число голосов должно быть от 0 до ${alive}.`);
  }
  const lifted = votesFor * 2 > alive;
  s.liftAllVotes.push({ day: s.day, candidates: [...p.candidates], votesFor, lifted });
  if (lifted) eliminateByVote(s, p.candidates);
  else s.queue.unshift({ kind: 'startNight' });
  popNext(s);
}

function onShoot(s: GameState, target: number | null): void {
  const p = s.phase;
  if (p.kind !== 'night' || p.step !== 'shoot') phaseError(s);
  const night = currentNight(s);
  if (!night) throw new Error('Нет записи текущей ночи.');
  if (target !== null) {
    checkSeatNumber(target);
    const seat = seatOf(s, target);
    if (!isAlive(seat)) fail(`Игрок №${target} уже выбыл.`);
    seat.status = 'killed';
    seat.skipNextSpeech = false;
    s.eliminations.push({ seat: target, day: s.day, kind: 'killed' });
    night.kill = target;
  }
  popNext(s);
}

function onCheck(s: GameState, target: number): void {
  const p = s.phase;
  if (p.kind !== 'night' || p.step === 'shoot') phaseError(s);
  if (!nightCheckerActive(s, p.step)) {
    fail(`${p.step === 'donCheck' ? 'Дон' : 'Шериф'} выбыл: проверки нет, выдержите паузу.`);
  }
  checkSeatNumber(target);
  const night = currentNight(s);
  if (!night) throw new Error('Нет записи текущей ночи.');
  const seat = seatOf(s, target);
  if (!actsTonight(s, seat)) fail(`Игрок №${target} уже выбыл.`);
  if (p.step === 'donCheck') night.donCheck = { target, isSheriff: seat.role === 'sheriff' };
  else night.sheriffCheck = { target, isBlack: teamOf(seat) === 'black' };
  popNext(s);
}

function onBestMove(s: GameState, targets: number[]): void {
  const p = s.phase;
  if (p.kind !== 'bestMove') phaseError(s);
  if (targets.length > 3) fail('В лучшем ходе не больше трёх номеров.');
  targets.forEach(checkSeatNumber);
  if (new Set(targets).size !== targets.length) fail('Номера в лучшем ходе не должны повторяться.');
  if (targets.includes(p.seat)) fail('Нельзя назвать себя в лучшем ходе.');
  const blacks = targets.filter((t) => teamOf(seatOf(s, t)) === 'black').length;
  s.bestMove = { seat: p.seat, targets: [...targets], blacks };
  popNext(s);
}

function onFoul(s: GameState, seatNumber: number): void {
  checkSeatNumber(seatNumber);
  const seat = seatOf(s, seatNumber);
  if (seat.status === 'removed') fail(`Игрок №${seatNumber} удалён.`);
  seat.fouls += 1;
  s.fouls.push({ seat: seatNumber, day: s.day, phase: s.phase.kind });
  if (!isAlive(seat)) return;
  const f = s.regulation.fouls;
  if (seat.fouls >= f.removeAt) removePlayer(s, seatNumber, 'removal');
  else if (seat.fouls === f.skipSpeechAt) seat.skipNextSpeech = true;
}

function onDisqualify(s: GameState, seatNumber: number): void {
  checkSeatNumber(seatNumber);
  if (!isAlive(seatOf(s, seatNumber))) fail(`Игрок №${seatNumber} уже выбыл.`);
  removePlayer(s, seatNumber, 'disqualification');
}

function onPpk(s: GameState, seatNumber: number): void {
  checkSeatNumber(seatNumber);
  const seat = seatOf(s, seatNumber);
  s.sanctions.push({ seat: seatNumber, day: s.day, kind: 'ppk' });
  if (isAlive(seat)) {
    seat.status = 'removed';
    s.eliminations.push({ seat: seatNumber, day: s.day, kind: 'removed' });
  }
  finish(s, teamOf(seat) === 'red' ? 'black' : 'red', 'ppk');
}

function onSetExtraPoints(s: GameState, seatNumber: number, value: number): void {
  if (!s.result) fail('Доп. баллы выставляются после завершения игры.');
  checkSeatNumber(seatNumber);
  const { extraMin, extraMax } = s.regulation.scoring;
  if (!Number.isFinite(value) || value < extraMin || value > extraMax) {
    fail(`Доп. баллы должны быть от ${extraMin} до ${extraMax}.`);
  }
  s.extraPoints[seatNumber] = value;
}

// ---------------------------------------------------------------------------
// Переходы между фазами
// ---------------------------------------------------------------------------

/** Переходит к следующей фазе из очереди, раскрывая маркеры и пропуская неактуальные фазы. */
function popNext(s: GameState): void {
  for (;;) {
    if (s.result) return;
    const item = s.queue.shift();
    if (!item) throw new Error('Очередь фаз пуста: внутренняя ошибка движка.');
    switch (item.kind) {
      case 'startDay':
        startDay(s);
        continue;
      case 'endSpeeches':
        endSpeeches(s);
        continue;
      case 'startNight':
        startNight(s);
        continue;
      case 'endNight':
        endNight(s);
        continue;
      case 'finishGame':
        finish(s, item.winner, item.reason);
        return;
      case 'speech': {
        const seat = seatOf(s, item.seat);
        if (!isAlive(seat)) continue;
        if (seat.skipNextSpeech) {
          seat.skipNextSpeech = false;
          if (aliveCount(s) <= s.regulation.fouls.smallTableAliveMax) {
            s.phase = { ...item, shortened: true };
            return;
          }
          continue;
        }
        s.phase = item;
        return;
      }
      case 'tieSpeech':
        if (!isAlive(seatOf(s, item.seat))) continue;
        s.phase = item;
        return;
      case 'farewell':
        if (seatOf(s, item.seat).status === 'removed') continue;
        s.phase = item;
        return;
      default:
        s.phase = item;
        return;
    }
  }
}

function startDay(s: GameState): void {
  s.day += 1;
  const from = s.dayOpener === null ? 1 : (s.dayOpener % SEAT_COUNT) + 1;
  const order = seatsFrom(from).filter((n) => isAlive(seatOf(s, n)));
  s.dayOpener = order[0] ?? null;
  s.queue.unshift(
    ...order.map((seat): QueueItem => ({ kind: 'speech', seat, shortened: false })),
    { kind: 'endSpeeches' },
  );
}

function endSpeeches(s: GameState): void {
  const reg = s.regulation.voting;
  const candidates = currentCandidates(s);
  if (s.dayRemoval && reg.noVoteAfterDayRemoval) {
    s.queue.unshift({ kind: 'startNight' });
    return;
  }
  if (candidates.length === 0) {
    s.queue.unshift({ kind: 'startNight' });
    return;
  }
  if (candidates.length === 1) {
    if (s.day === 1 && reg.firstDaySingleCandidateNoVote) {
      s.queue.unshift({ kind: 'startNight' });
      return;
    }
    if (reg.singleCandidateAutoEliminate) {
      eliminateByVote(s, candidates);
      return;
    }
  }
  s.queue.unshift({ kind: 'voting', round: 'main', candidates });
}

function startNight(s: GameState): void {
  s.dayRemoval = false;
  s.nights.push({ night: s.day, kill: null });
  s.queue.unshift(
    { kind: 'night', step: 'shoot' },
    { kind: 'night', step: 'donCheck' },
    { kind: 'night', step: 'sheriffCheck' },
    { kind: 'endNight' },
  );
}

function endNight(s: GameState): void {
  const kill = currentNight(s)?.kill ?? null;
  const result = winnerNow(s);
  const items: QueueItem[] = [{ kind: 'morning', killed: kill }];
  if (kill !== null) {
    if (bestMoveEligible(s, kill)) items.push({ kind: 'bestMove', seat: kill });
    items.push({ kind: 'farewell', seat: kill, reason: 'killed' });
  }
  // Если отстрел решил исход, убитый всё равно получает прощальную речь, потом игра завершается.
  items.push(result ? { kind: 'finishGame', ...result } : { kind: 'startDay' });
  s.queue.unshift(...items);
}

function bestMoveEligible(s: GameState, kill: number): boolean {
  const reg = s.regulation.bestMove;
  if (!reg.enabled || s.day !== 1) return false;
  if (!reg.requireFirstDeath) return true;
  const first = s.eliminations[0];
  return first !== undefined && first.seat === kill && first.kind === 'killed';
}

function eliminateByVote(s: GameState, seats: number[]): void {
  for (const n of seats) {
    const seat = seatOf(s, n);
    seat.status = 'voted';
    seat.skipNextSpeech = false;
    s.eliminations.push({ seat: n, day: s.day, kind: 'voted' });
  }
  // Если голосование решило исход, поднятые всё равно получают прощальные речи, потом игра завершается.
  const result = winnerNow(s);
  s.queue.unshift(
    ...seats.map((seat): QueueItem => ({ kind: 'farewell', seat, reason: 'voted' })),
    result ? { kind: 'finishGame', ...result } : { kind: 'startNight' },
  );
}

function removePlayer(s: GameState, seatNumber: number, kind: 'removal' | 'disqualification'): void {
  const seat = seatOf(s, seatNumber);
  seat.status = 'removed';
  seat.skipNextSpeech = false;
  s.eliminations.push({ seat: seatNumber, day: s.day, kind: 'removed' });
  s.sanctions.push({ seat: seatNumber, day: s.day, kind });

  const p: Phase = s.phase;
  if (isDayPhase(p)) s.dayRemoval = true;
  if (checkAndFinish(s)) return;

  const inVoting = p.kind === 'voting' || p.kind === 'tieSpeech' || p.kind === 'liftAllVote';
  if (inVoting) {
    // Голосование отменяется или начинается заново с оставшимися кандидатами.
    s.queue = s.regulation.voting.noVoteAfterDayRemoval ? [{ kind: 'startNight' }] : [{ kind: 'endSpeeches' }];
    popNext(s);
    return;
  }
  // Ночные фазы дона и шерифа не пропускаются даже после удаления, чтобы не выдать роль.
  if (p.kind === 'speech' && p.seat === seatNumber) popNext(s);
}

function checkAndFinish(s: GameState): boolean {
  const w = winnerNow(s);
  if (!w) return false;
  finish(s, w.winner, w.reason);
  return true;
}

function finish(s: GameState, winner: Team, reason: FinishReason): void {
  s.result = { winner, reason };
  s.phase = { kind: 'finished' };
  s.queue = [];
}

function sameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
