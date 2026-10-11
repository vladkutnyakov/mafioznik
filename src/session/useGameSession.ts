import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameRuleError, type GameEvent, type GameState } from '../engine';
import { KEYS, kvSet } from '../storage/db';
import * as S from './session';

export interface GameSessionApi {
  session: S.GameSession;
  state: GameState;
  /** Применяет действие. Возвращает false и показывает ошибку, если действие недопустимо. */
  dispatch: (event: GameEvent) => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  error: string | null;
  clearError: () => void;
}

/** Партия в памяти с автосохранением каждого действия в хранилище устройства. */
export function useGameSession(initial: S.GameSession): GameSessionApi {
  const [session, setSession] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(session);
  ref.current = session;

  const state = useMemo(() => S.sessionState(session), [session]);

  useEffect(() => {
    void kvSet(KEYS.activeSession, session);
  }, [session]);

  const guard = useCallback((fn: () => S.GameSession): boolean => {
    try {
      const next = fn();
      ref.current = next;
      setSession(next);
      setError(null);
      return true;
    } catch (e) {
      if (e instanceof GameRuleError) {
        setError(e.message);
        return false;
      }
      throw e;
    }
  }, []);

  const dispatch = useCallback((event: GameEvent) => guard(() => S.pushEvent(ref.current, event)), [guard]);
  const undo = useCallback(() => void guard(() => S.undo(ref.current)), [guard]);
  const redo = useCallback(() => void guard(() => S.redo(ref.current)), [guard]);
  const clearError = useCallback(() => setError(null), []);

  return {
    session,
    state,
    dispatch,
    undo,
    redo,
    canUndo: S.canUndo(session),
    canRedo: S.canRedo(session),
    error,
    clearError,
  };
}
