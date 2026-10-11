import {
  TEAM_NAMES,
  FINISH_REASON_NAMES,
  currentCandidates,
  describePhase,
  phaseDuration,
  seatOf,
  teamOf,
  type GameEvent,
  type GameState,
} from '../../engine';
import { Timer } from './Timer';
import { LiftAllPanel, VotingPanel } from './VotingPanels';

interface Props {
  state: GameState;
  phaseKey: string;
  selected: number[];
  setSelected: (seats: number[]) => void;
  dispatch: (event: GameEvent) => boolean;
  hideRoles: boolean;
}

export function PhasePanel({ state, phaseKey, selected, setSelected, dispatch, hideRoles }: Props) {
  const p = state.phase;
  const d = describePhase(state);
  const duration = phaseDuration(p, state.regulation);
  const advance = () => dispatch({ type: 'advance' });

  return (
    <div className="panel-inner">
      <div className="phase-head">
        <div className="phase-title">{d.title}</div>
        <div className="phase-prompt">{d.prompt}</div>
      </div>

      {duration !== null && (
        <Timer
          key={phaseKey}
          duration={duration}
          resetKey={phaseKey}
          warningAt={state.regulation.timings.warningAt}
        />
      )}

      <div className="phase-body">{renderBody()}</div>
    </div>
  );

  function renderBody() {
    switch (p.kind) {
      case 'night0':
      case 'morning':
      case 'tieSpeech':
      case 'farewell':
        return (
          <button className="btn btn-primary btn-lg btn-block" onClick={advance}>
            Дальше →
          </button>
        );

      case 'speech': {
        const candidates = currentCandidates(state);
        return (
          <>
            <div className="hint">Чтобы выставить кандидатуру или дать фол, нажмите на место игрока.</div>
            <div className="candidates-line">
              {candidates.length ? `На голосовании: ${candidates.map((c) => `№${c}`).join(', ')}` : 'Кандидатур пока нет'}
            </div>
            <button className="btn btn-primary btn-lg btn-block" onClick={advance}>
              Следующий игрок →
            </button>
          </>
        );
      }

      case 'voting':
        return <VotingPanel key={phaseKey} state={state} candidates={p.candidates} dispatch={dispatch} />;

      case 'liftAllVote':
        return <LiftAllPanel key={phaseKey} state={state} candidates={p.candidates} dispatch={dispatch} />;

      case 'night': {
        const target = selected[0];
        if (p.step === 'shoot') {
          return (
            <>
              <div className="hint">Нажмите на место игрока, в которого стреляла мафия.</div>
              <button
                className="btn btn-primary btn-lg btn-block"
                disabled={target === undefined}
                onClick={() => dispatch({ type: 'shoot', target: target! })}
              >
                {target === undefined ? 'Выберите игрока' : `Убит №${target}`}
              </button>
              <button className="btn btn-lg btn-block" onClick={() => dispatch({ type: 'shoot', target: null })}>
                Промах
              </button>
            </>
          );
        }
        const isDon = p.step === 'donCheck';
        const result =
          target === undefined
            ? null
            : isDon
              ? seatOf(state, target).role === 'sheriff'
                ? 'ШЕРИФ'
                : 'НЕ ШЕРИФ'
              : teamOf(seatOf(state, target)) === 'black'
                ? 'МАФИЯ'
                : 'МИРНЫЙ';
        const positive = result === 'ШЕРИФ' || result === 'МАФИЯ';
        return (
          <>
            <div className="hint">Нажмите на место игрока, которого проверяет {isDon ? 'дон' : 'шериф'}.</div>
            {result && (
              <div className={`check-result ${positive ? 'is-positive' : ''}`}>
                №{target}: {result}
              </div>
            )}
            <button
              className="btn btn-primary btn-lg btn-block"
              disabled={target === undefined}
              onClick={() => dispatch({ type: 'check', target: target! })}
            >
              Записать проверку
            </button>
            <button className="btn btn-lg btn-block" onClick={advance}>
              Без проверки
            </button>
          </>
        );
      }

      case 'bestMove':
        return (
          <>
            <div className="hint">Нажмите на места трёх названных игроков.</div>
            <div className="candidates-line">
              {selected.length ? `Выбрано: ${selected.map((n) => `№${n}`).join(', ')}` : 'Никто не выбран'}
            </div>
            <button
              className="btn btn-primary btn-lg btn-block"
              disabled={selected.length === 0}
              onClick={() => dispatch({ type: 'bestMove', targets: selected })}
            >
              Записать лучший ход
            </button>
            <button
              className="btn btn-lg btn-block"
              onClick={() => {
                setSelected([]);
                advance();
              }}
            >
              Без лучшего хода
            </button>
          </>
        );

      case 'finished':
        return (
          <div className="finished-banner" data-team={state.result?.winner}>
            <div className="finished-winner">Победа: {state.result ? TEAM_NAMES[state.result.winner] : '—'}</div>
            <div className="muted">{state.result ? FINISH_REASON_NAMES[state.result.reason] : ''}</div>
            {hideRoles && <div className="hint">Роли скрыты. Откройте их кнопкой с глазом.</div>}
          </div>
        );
    }
  }
}
