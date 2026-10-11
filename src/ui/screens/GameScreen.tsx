import { useEffect, useMemo, useRef, useState } from 'react';
import { describePhase } from '../../engine';
import type { GameSession } from '../../session/session';
import { useGameSession } from '../../session/useGameSession';
import { music } from '../../music/player';
import { ConfirmButton } from '../game/ConfirmButton';
import { MusicControl } from '../game/MusicControl';
import { ModalOpenContext, blurActive, isEnter, isTyping, seatFromKey, sendTimer } from '../game/keys';
import { Kbd } from '../game/PhasePanel';
import { ShortcutsHelp } from '../game/ShortcutsHelp';
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [foulMode, setFoulMode] = useState(false);
  // Ref нужен, чтобы «F» и номер, нажатые подряд, не зависели от перерисовки.
  const foulRef = useRef(false);
  const setFoul = (v: boolean) => {
    foulRef.current = v;
    setFoulMode(v);
  };

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

  // Музыка: включается с началом ночи, плавно затихает утром.
  useEffect(() => {
    if (isNight) void music.startNight();
    else void music.stopNight();
  }, [isNight]);

  useEffect(() => () => void music.stopNight(), []);

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
  const modalOpen = menuSeat !== null || helpOpen || menuOpen;

  // Режим фола с клавиатуры сам выключается, если номер не нажали.
  useEffect(() => {
    if (!foulMode) return;
    const id = window.setTimeout(() => setFoul(false), 4000);
    return () => window.clearTimeout(id);
  }, [foulMode]);

  // Горячие клавиши. Обработчик в фазе захвата, чтобы срабатывать раньше панелей голосования.
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  onKeyRef.current = (e) => {
    if (isTyping(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) game.redo();
      else game.undo();
      return;
    }
    if (mod && e.code === 'KeyY') {
      e.preventDefault();
      game.redo();
      return;
    }
    if (mod || e.altKey) return;

    if (e.code === 'Escape') {
      if (helpOpen) setHelpOpen(false);
      else if (menuSeat !== null) setMenuSeat(null);
      else if (menuOpen) setMenuOpen(false);
      else if (foulRef.current) setFoul(false);
      else setSelected([]);
      return;
    }
    if (helpOpen || menuOpen) return;
    if (menuSeat !== null) {
      if (e.code === 'KeyF') {
        e.preventDefault();
        if (game.dispatch({ type: 'foul', seat: menuSeat })) setMenuSeat(null);
      }
      return;
    }
    if (e.code === 'F1' || (e.code === 'Slash' && e.shiftKey)) {
      e.preventDefault();
      setHelpOpen(true);
      return;
    }

    const seat = seatFromKey(e);
    if (foulRef.current) {
      e.preventDefault();
      setFoul(false);
      if (seat !== null) game.dispatch({ type: 'foul', seat });
      return;
    }
    if (e.code === 'KeyF' && !state.result) {
      e.preventDefault();
      setFoul(true);
      return;
    }
    if (e.code === 'KeyH') {
      setHideRoles((v) => !v);
      return;
    }
    if (e.code === 'KeyM') {
      void music.toggle();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      blurActive();
      sendTimer('toggle');
      return;
    }
    if (e.code === 'KeyR') {
      sendTimer('reset');
      return;
    }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') {
      sendTimer('add');
      return;
    }

    if (state.result && !showTable) return;
    // На голосовании цифры и Enter обрабатывает сама панель голосования.
    if (state.phase.kind === 'voting' || state.phase.kind === 'liftAllVote') return;

    if (seat !== null && ui.picker) {
      e.preventDefault();
      if (e.repeat) return;
      const p = ui.picker;
      if (p.can(seat) || p.selected.includes(seat)) p.onPick(seat);
      return;
    }
    if (isEnter(e)) {
      e.preventDefault();
      if (e.repeat) return;
      blurActive();
      if (ui.primary && !ui.primary.disabled) ui.primary.onClick();
      return;
    }
    if (e.code === 'KeyN' && ui.secondary && !ui.secondary.disabled) {
      e.preventDefault();
      ui.secondary.onClick();
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

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
    <ModalOpenContext.Provider value={modalOpen}>
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

          <MusicControl />
  
          <button className={`btn ${hideRoles ? 'btn-warn' : ''}`} onClick={() => setHideRoles((v) => !v)}>
            {hideRoles ? 'Показать роли' : 'Скрыть роли'}
            <Kbd>H</Kbd>
          </button>
          <button className="btn" onClick={game.undo} disabled={!game.canUndo}>
            Отменить
            <Kbd>Ctrl+Z</Kbd>
          </button>
          <button className="btn" onClick={game.redo} disabled={!game.canRedo}>
            Вернуть
          </button>
          <button className="btn desktop-only" onClick={() => setHelpOpen(true)} title="Горячие клавиши">
            Клавиши <Kbd>?</Kbd>
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
  
        {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
  
        {foulMode && (
          <div className="key-banner" role="status">
            Фол: нажмите номер игрока. 0 — это №10. Esc — отмена.
          </div>
        )}
  
        {game.error && (
          <div className="toast" role="alert" onClick={game.clearError}>
            {game.error}
          </div>
        )}
      </div>
    </ModalOpenContext.Provider>
  );
}
