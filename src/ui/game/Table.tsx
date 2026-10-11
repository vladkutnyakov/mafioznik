import {
  ROLE_NAMES,
  aliveByTeam,
  currentCandidates,
  type GameState,
  type SeatState,
} from '../../engine';

interface Props {
  state: GameState;
  hideRoles: boolean;
  selected: number[];
  /** Если задано, стол работает как выбор игрока: невыбираемые места приглушены. */
  selectable: ((seat: number) => boolean) | null;
  onSeatTap: (seat: number) => void;
}

const ROLE_ICON: Record<SeatState['role'], string> = {
  civilian: '',
  sheriff: '★',
  mafia: '',
  don: '♛',
};

/** Место на овале: №1 слева от ведущего (ведущий внизу), дальше по часовой стрелке. */
function seatPosition(seat: number): { left: string; top: string } {
  const angle = ((90 + (seat - 0.5) * 36) * Math.PI) / 180;
  return {
    left: `${50 + 41 * Math.cos(angle)}%`,
    top: `${50 + 40 * Math.sin(angle)}%`,
  };
}

function activeSeat(state: GameState): number | null {
  const p = state.phase;
  switch (p.kind) {
    case 'speech':
    case 'tieSpeech':
    case 'farewell':
    case 'bestMove':
      return p.seat;
    default:
      return null;
  }
}

function statusLabel(state: GameState, seat: SeatState): string | null {
  if (seat.status === 'alive') return null;
  const e = state.eliminations.find((x) => x.seat === seat.seat);
  if (seat.status === 'killed') return `Убит · ночь ${e?.day ?? ''}`;
  if (seat.status === 'voted') return `Заголосован · день ${e?.day ?? ''}`;
  return 'Удалён';
}

const showsNominations = (state: GameState) =>
  ['speech', 'voting', 'tieSpeech', 'liftAllVote'].includes(state.phase.kind);

export function Table({ state, hideRoles, selected, selectable, onSeatTap }: Props) {
  const candidates = showsNominations(state) ? currentCandidates(state) : [];
  const speaker = activeSeat(state);
  const alive = aliveByTeam(state);
  const p = state.phase;
  const centerLabel =
    p.kind === 'finished'
      ? 'Игра окончена'
      : p.kind === 'night0'
        ? 'Ночь 0'
        : p.kind === 'night'
          ? `Ночь ${state.day}`
          : p.kind === 'morning' || p.kind === 'bestMove' || (p.kind === 'farewell' && p.reason === 'killed')
            ? `Утро · день ${state.day + 1}`
            : `День ${state.day}`;

  return (
    <div className="table">
      <div className="table-oval">
        <div className="table-center">
          <div className="table-day">{centerLabel}</div>
          {!hideRoles && (
            <div className="table-alive">
              <span className="team-dot red" /> {alive.red} <span className="team-dot black" /> {alive.black}
            </div>
          )}
          {candidates.length > 0 && (
            <div className="table-candidates">
              <div className="muted">На голосовании</div>
              <div className="table-candidates-list">{candidates.map((c) => `№${c}`).join('  ')}</div>
            </div>
          )}
        </div>
      </div>

      {state.seats.map((seat) => {
        const pos = seatPosition(seat.seat);
        const status = statusLabel(state, seat);
        const candidateIdx = candidates.indexOf(seat.seat);
        const nominated = showsNominations(state)
          ? state.nominations.filter((n) => n.day === state.day && n.by === seat.seat).map((n) => n.target)
          : [];
        const sheriffChecks = state.nights.filter((n) => n.sheriffCheck?.target === seat.seat);
        const donChecks = state.nights.filter((n) => n.donCheck?.target === seat.seat);
        const isSelectable = selectable ? selectable(seat.seat) : true;
        const classes = [
          'seat',
          seat.status !== 'alive' ? 'is-out' : '',
          speaker === seat.seat ? 'is-active' : '',
          selected.includes(seat.seat) ? 'is-selected' : '',
          selectable && !isSelectable ? 'is-disabled' : '',
          candidateIdx >= 0 ? 'is-candidate' : '',
        ].join(' ');

        return (
          <button
            key={seat.seat}
            className={classes}
            style={pos}
            data-team={hideRoles ? undefined : seat.role === 'civilian' || seat.role === 'sheriff' ? 'red' : 'black'}
            disabled={Boolean(selectable) && !isSelectable}
            onClick={() => onSeatTap(seat.seat)}
          >
            <div className="seat-top">
              <span className="seat-number">{seat.seat}</span>
              {!hideRoles && (
                <span className={`seat-role role-${seat.role}`}>
                  {ROLE_ICON[seat.role]} {ROLE_NAMES[seat.role]}
                </span>
              )}
            </div>
            <div className="seat-nick">{seat.player.nickname}</div>
            <div className="seat-bottom">
              <span className="fouls" aria-label={`Фолов: ${seat.fouls}`}>
                {[0, 1, 2, 3].map((i) => (
                  <i key={i} className={i < seat.fouls ? (seat.fouls >= 3 ? 'on hot' : 'on') : ''} />
                ))}
              </span>
              {candidateIdx >= 0 && <span className="chip chip-accent">голосование {candidateIdx + 1}</span>}
              {nominated.map((t) => (
                <span key={t} className="chip">
                  → №{t}
                </span>
              ))}
              {seat.skipNextSpeech && <span className="chip chip-warn">без речи</span>}
            </div>
            {!hideRoles && (sheriffChecks.length > 0 || donChecks.length > 0) && (
              <div className="seat-checks">
                {sheriffChecks.map((n) => (
                  <span key={`s${n.night}`} className={`chip ${n.sheriffCheck!.isBlack ? 'chip-black' : 'chip-red'}`}>
                    Шериф: {n.sheriffCheck!.isBlack ? 'чёрный' : 'красный'}
                  </span>
                ))}
                {donChecks.map((n) => (
                  <span key={`d${n.night}`} className="chip">
                    Дон: {n.donCheck!.isSheriff ? 'шериф' : 'не шериф'}
                  </span>
                ))}
              </div>
            )}
            {status && <div className="seat-status">{status}</div>}
          </button>
        );
      })}
    </div>
  );
}
