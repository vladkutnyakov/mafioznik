import { phaseDuration, type GameEvent, type GameState } from '../../engine';
import type { ActionSpec, PhaseUi } from './phaseUi';
import { SeatPicker } from './SeatPicker';
import { Timer } from './Timer';
import { LiftAllPanel, VotingPanel } from './VotingPanels';

interface Props {
  state: GameState;
  ui: PhaseUi;
  phaseKey: string;
  dispatch: (event: GameEvent) => boolean;
}

export function Kbd({ children }: { children: string }) {
  return <kbd className="kbd">{children}</kbd>;
}

function ActionButton({ action, primary }: { action: ActionSpec; primary: boolean }) {
  return (
    <button
      className={`btn btn-lg btn-block ${primary ? 'btn-primary' : ''}`}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      <span>{action.label}</span>
      {action.kbd && <Kbd>{action.kbd}</Kbd>}
    </button>
  );
}

/** Панель текущего шага: что происходит, что сказать, что ввести, куда нажать дальше. */
export function PhasePanel({ state, ui, phaseKey, dispatch }: Props) {
  const duration = phaseDuration(state.phase, state.regulation);

  return (
    <div className="panel-inner">
      <div className="panel-scroll">
        <div className="step">
          <div className="step-over">{ui.overline}</div>
          <h2 className="step-heading">{ui.heading}</h2>
        </div>

        {ui.say && (
          <div className="say">
            <div className="section-label">Ведущий говорит</div>
            <div className="say-text">{ui.say}</div>
          </div>
        )}

        {ui.note && <div className={`note note-${ui.noteTone ?? 'info'}`}>{ui.note}</div>}

        {duration !== null && (
          <Timer key={`${phaseKey}:${duration}`} duration={duration} warningAt={state.regulation.timings.warningAt} />
        )}

        {ui.custom === 'voting' && state.phase.kind === 'voting' && (
          <VotingPanel key={phaseKey} state={state} candidates={state.phase.candidates} dispatch={dispatch} />
        )}
        {ui.custom === 'liftAll' && state.phase.kind === 'liftAllVote' && (
          <LiftAllPanel key={phaseKey} state={state} candidates={state.phase.candidates} dispatch={dispatch} />
        )}

        {ui.extraFirst && ui.extra}
        {ui.picker && <SeatPicker state={state} spec={ui.picker} />}
        {!ui.extraFirst && ui.extra}
      </div>

      {(ui.primary || ui.secondary) && (
        <div className="panel-footer">
          {ui.primary && <ActionButton action={ui.primary} primary />}
          {ui.secondary && <ActionButton action={ui.secondary} primary={false} />}
        </div>
      )}
    </div>
  );
}
