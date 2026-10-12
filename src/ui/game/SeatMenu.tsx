import { ROLE_NAMES, isAlive, seatOf, type GameEvent, type GameState } from '../../engine';
import { ConfirmButton } from './ConfirmButton';
import { nominateBlocker } from './rules';

interface Props {
  state: GameState;
  seat: number;
  hideRoles: boolean;
  dispatch: (event: GameEvent) => boolean;
  onClose: () => void;
}

function foulHint(state: GameState, fouls: number): string | null {
  const f = state.regulation.fouls;
  if (fouls + 1 >= f.removeAt) return 'Это будет четвёртый фол: игрок удаляется.';
  if (fouls + 1 === f.skipSpeechAt) return 'Третий фол: игрок пропустит ближайшую речь.';
  return null;
}

const STATUS: Record<string, string> = { killed: 'убит', voted: 'ушёл голосованием', removed: 'удалён' };

/** Карточка игрока: фолы, выставление, удаление. */
export function SeatMenu({ state, seat, hideRoles, dispatch, onClose }: Props) {
  const s = seatOf(state, seat);
  const p = state.phase;
  const alive = isAlive(s);
  const blocker = nominateBlocker(state, seat);
  const nomination = state.nominations.find((n) => n.day === state.day && n.target === seat);
  const canCancel = nomination !== undefined && (p.kind === 'speech' || (p.kind === 'voting' && p.round === 'main'));
  const hint = alive ? foulHint(state, s.fouls) : null;
  const act = (event: GameEvent) => {
    if (dispatch(event)) onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Игрок №${seat}`}>
        <div className="sheet-head">
          <span className="sheet-no">{seat}</span>
          <div className="sheet-who">
            <div className="sheet-title" title={s.player.nickname}>
              {s.player.nickname}
            </div>
            <div className="muted">
              {!hideRoles && `${ROLE_NAMES[s.role]} · `}
              фолов: {s.fouls}
              {s.status !== 'alive' && ` · ${STATUS[s.status]}`}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="sheet-actions">
          {canCancel && (
            <button className="btn btn-lg btn-block" onClick={() => act({ type: 'cancelNomination', target: seat })}>
              Снять выставление №{seat}
            </button>
          )}

          {p.kind === 'speech' && alive && !canCancel && blocker === null && (
            <button className="btn btn-lg btn-block" onClick={() => act({ type: 'nominate', target: seat })}>
              Выставить №{seat} от имени №{p.seat}
            </button>
          )}

          {s.status !== 'removed' && (
            <div>
              <button className="btn btn-primary btn-lg btn-block" onClick={() => act({ type: 'foul', seat })}>
                Дать фол · станет {s.fouls + 1}
              </button>
              {hint && <div className="hint hint-warn">{hint}</div>}
            </div>
          )}

          {alive && (
            <div className="sheet-danger">
              <div className="section-label">Нарушения</div>
              <div className="row">
                <ConfirmButton
                  className="btn btn-danger spacer"
                  confirmLabel="Точно удалить?"
                  onConfirm={() => act({ type: 'disqualify', seat })}
                >
                  Дисквалификация
                </ConfirmButton>
                <ConfirmButton
                  className="btn btn-danger spacer"
                  confirmLabel="Команда проиграет. Точно?"
                  onConfirm={() => act({ type: 'ppk', seat })}
                >
                  Поражение команды
                </ConfirmButton>
              </div>
              <div className="hint">
                Дисквалификация удаляет только игрока. Поражение команды (ППК) сразу завершает игру победой соперников.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
