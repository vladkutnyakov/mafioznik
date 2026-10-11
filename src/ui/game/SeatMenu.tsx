import {
  ROLE_NAMES,
  currentCandidates,
  isAlive,
  nominatedBy,
  seatOf,
  type GameEvent,
  type GameState,
} from '../../engine';
import { ConfirmButton } from './ConfirmButton';

interface Props {
  state: GameState;
  seat: number;
  hideRoles: boolean;
  dispatch: (event: GameEvent) => boolean;
  onClose: () => void;
}

function nominateBlocker(state: GameState, target: number): string | null {
  const p = state.phase;
  if (p.kind !== 'speech') return 'Выставлять можно только во время речи.';
  if (!isAlive(seatOf(state, target))) return 'Игрок выбыл.';
  const reg = state.regulation.nominations;
  if (!reg.allowSelf && target === p.seat) return 'Нельзя выставить себя.';
  if (currentCandidates(state).includes(target)) return 'Уже выставлен.';
  if (nominatedBy(state, p.seat).length >= reg.perSpeech) return `Игрок №${p.seat} уже выставил кандидатуру.`;
  return null;
}

function foulHint(state: GameState, fouls: number): string | null {
  const f = state.regulation.fouls;
  if (fouls + 1 >= f.removeAt) return 'Игрок будет удалён.';
  if (fouls + 1 === f.skipSpeechAt) return 'Игрок пропустит ближайшую речь.';
  return null;
}

export function SeatMenu({ state, seat, hideRoles, dispatch, onClose }: Props) {
  const s = seatOf(state, seat);
  const p = state.phase;
  const alive = isAlive(s);
  const blocker = nominateBlocker(state, seat);
  const nomination = state.nominations.find((n) => n.day === state.day && n.target === seat);
  const canCancel = nomination !== undefined && (p.kind === 'speech' || (p.kind === 'voting' && p.round === 'main'));
  const act = (event: GameEvent) => {
    if (dispatch(event)) onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Игрок №${seat}`}>
        <div className="sheet-head">
          <div className="seat-num big">{seat}</div>
          <div>
            <div className="sheet-title">{s.player.nickname}</div>
            <div className="muted">
              {!hideRoles && `${ROLE_NAMES[s.role]} · `}
              Фолов: {s.fouls}
              {s.status !== 'alive' && ` · ${s.status === 'killed' ? 'убит' : s.status === 'voted' ? 'заголосован' : 'удалён'}`}
            </div>
          </div>
          <div className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="sheet-actions">
          {canCancel && (
            <button className="btn btn-lg btn-block btn-warn" onClick={() => act({ type: 'cancelNomination', target: seat })}>
              Снять выставление №{seat}
              <span className="btn-sub">выставил №{nomination.by}</span>
            </button>
          )}

          {p.kind === 'speech' && alive && !canCancel && (
            <div>
              <button
                className="btn btn-primary btn-lg btn-block"
                disabled={blocker !== null}
                onClick={() => act({ type: 'nominate', target: seat })}
              >
                Выставить №{seat}
                <span className="btn-sub">выставляет №{p.seat}</span>
              </button>
              {blocker && <div className="hint">{blocker}</div>}
            </div>
          )}

          {s.status !== 'removed' && (
            <div>
              <button className="btn btn-lg btn-block" onClick={() => act({ type: 'foul', seat })}>
                Фол: {s.fouls} → {s.fouls + 1}
              </button>
              {alive && foulHint(state, s.fouls) && <div className="hint warn">{foulHint(state, s.fouls)}</div>}
            </div>
          )}

          {alive && (
            <div className="row">
              <ConfirmButton className="btn btn-danger spacer" onConfirm={() => act({ type: 'disqualify', seat })}>
                Дисквалификация
              </ConfirmButton>
              <ConfirmButton className="btn btn-danger spacer" onConfirm={() => act({ type: 'ppk', seat })}>
                ППК
              </ConfirmButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
