import { applyEvent, createGame, replay, type GameEvent, type GameSetup, type GameState } from '../engine';

/** Событие журнала с моментом, когда ведущий его совершил. */
export interface LoggedEvent {
  at: number;
  event: GameEvent;
}

/** Партия: рассадка, регламент и журнал действий ведущего. Это всё, что нужно сохранять. */
export interface GameSession {
  id: string;
  createdAt: number;
  setup: GameSetup;
  events: LoggedEvent[];
  /** Отменённые события, которые можно вернуть. */
  redo: LoggedEvent[];
  finishedAt?: number;
}

/** crypto.randomUUID работает только по https, поэтому нужен запасной вариант для локальной сети. */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // небезопасный контекст
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Создаёт партию. Бросает GameRuleError, если рассадка некорректна. */
export function newSession(setup: GameSetup, now = Date.now()): GameSession {
  createGame(setup);
  return { id: makeId(), createdAt: now, setup, events: [], redo: [] };
}

export function sessionState(session: GameSession): GameState {
  return replay(
    session.setup,
    session.events.map((e) => e.event),
  );
}

/** Добавляет действие ведущего. Бросает GameRuleError, если действие недопустимо. */
export function pushEvent(session: GameSession, event: GameEvent, now = Date.now()): GameSession {
  applyEvent(sessionState(session), event);
  return { ...session, events: [...session.events, { at: now, event }], redo: [] };
}

export function canUndo(session: GameSession): boolean {
  return session.events.length > 0;
}

export function canRedo(session: GameSession): boolean {
  return session.redo.length > 0;
}

export function undo(session: GameSession): GameSession {
  const last = session.events[session.events.length - 1];
  if (!last) return session;
  return { ...session, events: session.events.slice(0, -1), redo: [last, ...session.redo] };
}

export function redo(session: GameSession): GameSession {
  const [next, ...rest] = session.redo;
  if (!next) return session;
  applyEvent(sessionState(session), next.event);
  return { ...session, events: [...session.events, next], redo: rest };
}
