import { useEffect, useMemo, useState } from 'react';
import { actsTonight, describePhase, isAlive, nightCheckerActive, seatOf, type GameState } from '../../engine';
import type { GameSession } from '../../session/session';
import { useGameSession } from '../../session/useGameSession';
import { ConfirmButton } from '../game/ConfirmButton';
import { PhasePanel } from '../game/PhasePanel';
import { ResultsView } from '../game/ResultsView';
import { SeatMenu } from '../game/SeatMenu';
import { Table } from '../game/Table';
import { useWakeLock } from '../hooks/useWakeLock';

interface Props {
  initial: GameSession;
  onExit: () => void;
  onSave: (session: GameSession) => void;
}

const HIDE_ROLES_KEY = 'mafioznik:hideRoles';

function readHideRoles(): boolean {
  try {
    return localStorage.getItem(HIDE_ROLES_KEY) === '1';
  } catch {
    return false;
  }
}

/** Режим выбора игрока на столе для текущей фазы. */
function selectionMode(state: GameState): { max: number; can: (seat: number) => boolean } | null {
  const p = state.phase;
  if (p.kind === 'night') {
    const step = p.step;
    if (step === 'shoot') return { max: 1, can: (n) => isAlive(seatOf(state, n)) };
    // Выбывший дон или шериф: фаза идёт для вида, выбирать некого.
    if (!nightCheckerActive(state, step)) return null;
    const checker = state.seats.find((s) => s.role === (step === 'donCheck' ? 'don' : 'sheriff'));
    return { max: 1, can: (n) => n !== checker?.seat && actsTonight(state, seatOf(state, n)) };
  }
  if (p.kind === 'bestMove') {
    return { max: 3, can: (n) => n !== p.seat };
  }
  return null;
}

export function GameScreen({ initial, onExit, onSave }: Props) {
  const game = useGameSession(initial);
  const { state } = game;
  const [hideRoles, setHideRoles] = useState(readHideRoles);
  const [menuSeat, setMenuSeat] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [showFinish, setShowFinish] = useState(false);
  const [showTable, setShowTable] = useState(false);

  useWakeLock(true);

  const phaseKey = `${state.day}:${JSON.stringify(state.phase)}`;
  const mode = useMemo(() => selectionMode(state), [state]);
  const isNight = state.phase.kind === 'night' || state.phase.kind === 'night0';

  useEffect(() => setSelected([]), [phaseKey]);

  useEffect(() => {
    if (!state.result) setShowTable(false);
  }, [state.result]);

  useEffect(() => {
    try {
      localStorage.setItem(HIDE_ROLES_KEY, hideRoles ? '1' : '0');
    } catch {
      // не критично
    }
  }, [hideRoles]);

  useEffect(() => {
    if (!game.error) return;
    const id = window.setTimeout(game.clearError, 4000);
    return () => window.clearTimeout(id);
  }, [game.error, game.clearError]);

  const onSeatTap = (seat: number) => {
    if (mode) {
      if (!mode.can(seat)) return;
      setSelected((prev) => {
        if (prev.includes(seat)) return prev.filter((s) => s !== seat);
        if (mode.max === 1) return [seat];
        return prev.length >= mode.max ? prev : [...prev, seat];
      });
      return;
    }
    setMenuSeat(seat);
  };

  return (
    <div className={`game ${isNight ? 'is-night' : ''}`}>
      <header className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="В меню" title="В меню">
          ☰
        </button>
        <div className="topbar-title">{describePhase(state).title}</div>
        <div className="spacer" />
        <button
          className={`icon-btn ${hideRoles ? 'is-on' : ''}`}
          onClick={() => setHideRoles((v) => !v)}
          title={hideRoles ? 'Показать роли' : 'Скрыть роли'}
          aria-pressed={hideRoles}
        >
          {hideRoles ? '🙈' : '👁'}
        </button>
        <button className="icon-btn" onClick={game.undo} disabled={!game.canUndo} title="Отменить">
          ↶
        </button>
        <button className="icon-btn" onClick={game.redo} disabled={!game.canRedo} title="Вернуть">
          ↷
        </button>
        {state.result && showTable && (
          <button className="btn btn-primary" onClick={() => setShowTable(false)}>
            Итоги
          </button>
        )}
        {!state.result && (
          <button className="btn" onClick={() => setShowFinish((v) => !v)}>
            Завершить
          </button>
        )}
      </header>

      {showFinish && !state.result && (
        <div className="finish-bar">
          <span className="muted">Завершить игру решением ведущего:</span>
          <ConfirmButton
            className="btn"
            onConfirm={() => {
              game.dispatch({ type: 'finish', winner: 'red' });
              setShowFinish(false);
            }}
          >
            Победа мирных
          </ConfirmButton>
          <ConfirmButton
            className="btn"
            onConfirm={() => {
              game.dispatch({ type: 'finish', winner: 'black' });
              setShowFinish(false);
            }}
          >
            Победа мафии
          </ConfirmButton>
          <button className="btn btn-ghost" onClick={() => setShowFinish(false)}>
            Отмена
          </button>
        </div>
      )}

      {state.result && !showTable ? (
        <ResultsView
          state={state}
          dispatch={game.dispatch}
          onSave={() => onSave(game.session)}
          onShowTable={() => setShowTable(true)}
        />
      ) : (
        <div className="game-body">
          <section className="table-wrap">
            <Table
              state={state}
              hideRoles={hideRoles}
              selected={selected}
              selectable={mode ? mode.can : null}
              onSeatTap={onSeatTap}
            />
          </section>
          <aside className="panel">
            <PhasePanel
              state={state}
              phaseKey={phaseKey}
              selected={selected}
              setSelected={setSelected}
              dispatch={game.dispatch}
              hideRoles={hideRoles}
            />
          </aside>
        </div>
      )}

      {menuSeat !== null && (
        <SeatMenu
          state={state}
          seat={menuSeat}
          hideRoles={hideRoles}
          dispatch={game.dispatch}
          onClose={() => setMenuSeat(null)}
        />
      )}

      {game.error && (
        <div className="toast" role="alert" onClick={game.clearError}>
          {game.error}
        </div>
      )}
    </div>
  );
}
