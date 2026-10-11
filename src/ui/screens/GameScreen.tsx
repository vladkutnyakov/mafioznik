import { useEffect, useMemo, useState } from 'react';
import { describePhase } from '../../engine';
import type { GameSession } from '../../session/session';
import { useGameSession } from '../../session/useGameSession';
import { ConfirmButton } from '../game/ConfirmButton';
import { PhasePanel } from '../game/PhasePanel';
import { buildPhaseUi } from '../game/phaseUi';
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

export function GameScreen({ initial, onExit, onSave }: Props) {
  const game = useGameSession(initial);
  const { state } = game;
  const [hideRoles, setHideRoles] = useState(readHideRoles);
  const [menuSeat, setMenuSeat] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTable, setShowTable] = useState(false);

  useWakeLock(true);

  const phaseKey = `${state.day}:${JSON.stringify(state.phase)}`;
  const isNight = state.phase.kind === 'night' || state.phase.kind === 'night0';

  const ui = useMemo(
    () =>
      buildPhaseUi({
        state,
        dispatch: game.dispatch,
        selected,
        setSelected,
        onShowResults: () => setShowTable(false),
      }),
    [state, game.dispatch, selected],
  );

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

  const tablePicks = ui.picker?.tableSelects ? ui.picker : null;

  const onSeatTap = (seat: number) => {
    if (tablePicks) {
      if (tablePicks.can(seat) || tablePicks.selected.includes(seat)) tablePicks.onPick(seat);
      return;
    }
    setMenuSeat(seat);
  };

  const finish = (winner: 'red' | 'black') => {
    game.dispatch({ type: 'finish', winner });
    setMenuOpen(false);
  };

  return (
    <div className={`game ${isNight ? 'is-night' : ''}`}>
      <header className="topbar">
        <div className="menu-wrap">
          <button className="btn" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
            Меню
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="menu" role="menu">
                <button className="menu-item" onClick={onExit}>
                  Выйти в главное меню
                  <span className="menu-sub">Партия сохранится, её можно продолжить</span>
                </button>
                {!state.result && (
                  <>
                    <div className="menu-sep" />
                    <div className="menu-label">Завершить игру решением ведущего</div>
                    <ConfirmButton className="menu-item" confirmLabel="Нажмите ещё раз" onConfirm={() => finish('red')}>
                      Победа мирных
                    </ConfirmButton>
                    <ConfirmButton className="menu-item" confirmLabel="Нажмите ещё раз" onConfirm={() => finish('black')}>
                      Победа мафии
                    </ConfirmButton>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="topbar-title">{describePhase(state).title}</div>

        <button className={`btn ${hideRoles ? 'btn-warn' : ''}`} onClick={() => setHideRoles((v) => !v)}>
          {hideRoles ? 'Показать роли' : 'Скрыть роли'}
        </button>
        <button className="btn" onClick={game.undo} disabled={!game.canUndo}>
          Отменить
        </button>
        <button className="btn" onClick={game.redo} disabled={!game.canRedo}>
          Вернуть
        </button>
        {state.result && showTable && (
          <button className="btn btn-primary" onClick={() => setShowTable(false)}>
            К итогам
          </button>
        )}
      </header>

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
            <div className={`table-hint ${tablePicks ? 'is-picking' : ''}`}>
              {tablePicks
                ? `${tablePicks.label} Выберите игрока на столе или в панели.`
                : 'Нажмите на игрока, чтобы дать фол или удалить его.'}
            </div>
            <Table
              state={state}
              hideRoles={hideRoles}
              selected={tablePicks ? tablePicks.selected : []}
              selectable={tablePicks ? (n) => tablePicks.can(n) || tablePicks.selected.includes(n) : null}
              onSeatTap={onSeatTap}
            />
          </section>
          <aside className="panel">
            <PhasePanel state={state} ui={ui} phaseKey={phaseKey} dispatch={game.dispatch} />
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
