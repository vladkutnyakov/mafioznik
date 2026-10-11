import { ROLE_NAMES, aliveByTeam, currentCandidates, type GameState, type SeatState } from '../../engine';

interface Props {
  state: GameState;
  hideRoles: boolean;
  selected: number[];
  /** Если задано, стол работает как выбор игрока: невыбираемые места приглушены. */
  selectable: ((seat: number) => boolean) | null;
  onSeatTap: (seat: number) => void;
}

/** Место на овале: №1 слева от ведущего (ведущий внизу), дальше по часовой стрелке. */
function seatPosition(seat: number): { left: string; top: string } {
  const angle = ((90 + (seat - 0.5) * 36) * Math.PI) / 180;
  return {
    left: `${50 + 40 * Math.cos(angle)}%`,
    top: `${50 + 39 * Math.sin(angle)}%`,
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
  if (seat.status === 'killed') return `Убит в ночь ${e?.day ?? ''}`;
  if (seat.status === 'voted') return `Ушёл в день ${e?.day ?? ''}`;
  return 'Удалён';
}

function centerLabel(state: GameState): string {
  const p = state.phase;
  if (p.kind === 'finished') return 'Игра окончена';
  if (p.kind === 'night0') return 'Ночь 0';
  if (p.kind === 'night') return `Ночь ${state.day}`;
  if (p.kind === 'morning' || p.kind === 'bestMove' || (p.kind === 'farewell' && p.reason === 'killed')) {
    return `Утро`;
  }
  return `День ${state.day}`;
}

const showsNominations = (state: GameState) => ['speech', 'voting', 'tieSpeech', 'liftAllVote'].includes(state.phase.kind);

export function Table({ state, hideRoles, selected, selectable, onSeatTap }: Props) {
  const candidates = showsNominations(state) ? currentCandidates(state) : [];
  const speaker = activeSeat(state);
  const alive = aliveByTeam(state);

  return (
    <div className="table">
      <div className="table-oval">
        <div className="table-center">
          <div className="table-day">{centerLabel(state)}</div>
          {!hideRoles && (
            <div className="table-alive">
              <span>
                <i className="dot dot-red" /> красных {alive.red}
              </span>
              <span>
                <i className="dot dot-black" /> чёрных {alive.black}
              </span>
            </div>
          )}
          {candidates.length > 0 && (
            <div className="table-candidates">
              На голосовании: <b>{candidates.map((c) => `№${c}`).join(', ')}</b>
            </div>
          )}
        </div>
      </div>

      {state.seats.map((seat) => {
        const status = statusLabel(state, seat);
        const candidateIdx = candidates.indexOf(seat.seat);
        const nominated = showsNominations(state)
          ? state.nominations.filter((n) => n.day === state.day && n.by === seat.seat).map((n) => n.target)
          : [];
        const sheriffChecks = state.nights.filter((n) => n.sheriffCheck?.target === seat.seat);
        const donChecks = state.nights.filter((n) => n.donCheck?.target === seat.seat);
        const canSelect = selectable ? selectable(seat.seat) : true;
        const isRed = seat.role === 'civilian' || seat.role === 'sheriff';
        const classes = [
          'seat',
          seat.status !== 'alive' ? 'is-out' : '',
          speaker === seat.seat ? 'is-active' : '',
          selected.includes(seat.seat) ? 'is-selected' : '',
          selectable && !canSelect ? 'is-disabled' : '',
          selectable && canSelect ? 'is-pickable' : '',
          candidateIdx >= 0 ? 'is-candidate' : '',
        ].join(' ');

        const tags: { text: string; tone?: string }[] = [];
        if (candidateIdx >= 0) tags.push({ text: `кандидат ${candidateIdx + 1}`, tone: 'amber' });
        nominated.forEach((t) => tags.push({ text: `выставил №${t}` }));
        if (seat.skipNextSpeech) tags.push({ text: 'без речи', tone: 'amber' });
        if (!hideRoles) {
          sheriffChecks.forEach((n) =>
            tags.push({ text: `шериф: ${n.sheriffCheck!.isBlack ? 'чёрный' : 'красный'}`, tone: n.sheriffCheck!.isBlack ? 'black' : 'red' }),
          );
          donChecks.forEach((n) => tags.push({ text: `дон: ${n.donCheck!.isSheriff ? 'шериф' : 'не шериф'}` }));
        }

        return (
          <button
            key={seat.seat}
            className={classes}
            style={seatPosition(seat.seat)}
            disabled={Boolean(selectable) && !canSelect}
            onClick={() => onSeatTap(seat.seat)}
          >
            <span className="seat-head">
              <span className="seat-no">{seat.seat}</span>
              <span className="seat-name">{seat.player.nickname}</span>
            </span>
            {(!hideRoles || status) && (
              <span className="seat-line">
                {!hideRoles && (
                  <span className={`seat-role ${isRed ? 'is-red' : 'is-black'}`}>
                    <i className={`dot ${isRed ? 'dot-red' : 'dot-black'}`} />
                    {ROLE_NAMES[seat.role]}
                  </span>
                )}
                {status && <span className="seat-status">{status}</span>}
              </span>
            )}
            <span className="seat-line">
              <span className={`seat-fouls ${seat.fouls >= 3 ? 'is-hot' : ''}`} aria-label={`Фолов: ${seat.fouls}`}>
                {[0, 1, 2, 3].map((i) => (
                  <i key={i} className={i < seat.fouls ? 'on' : ''} />
                ))}
              </span>
            </span>
            {tags.length > 0 && (
              <span className="seat-tags">
                {tags.map((t, i) => (
                  <span key={i} className={`tag ${t.tone ? `tag-${t.tone}` : ''}`}>
                    {t.text}
                  </span>
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
