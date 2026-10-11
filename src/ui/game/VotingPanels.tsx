import { useState } from 'react';
import { aliveCount, type GameEvent, type GameState } from '../../engine';
import { NumberPad } from './NumberPad';
import { Kbd } from './PhasePanel';
import { nick } from './rules';

const list = (seats: number[]) => seats.map((n) => `№${n}`).join(', ');

interface VotingProps {
  state: GameState;
  candidates: number[];
  dispatch: (event: GameEvent) => boolean;
}

/** Ввод голосов по кандидатам. Последнему кандидату голоса начисляются автоматически. */
export function VotingPanel({ state, candidates, dispatch }: VotingProps) {
  const alive = aliveCount(state);
  const n = candidates.length;
  const [values, setValues] = useState<(number | null)[]>(() => Array(Math.max(0, n - 1)).fill(null));
  const [active, setActive] = useState(0);

  const entered = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  const last = alive - entered;
  const full = [...values.map((v) => v ?? 0), last];
  const complete = values.every((v) => v !== null);
  const max = Math.max(...full);
  const leaders = candidates.filter((_, i) => full[i] === max);
  const maxForActive = alive - (entered - (values[active] ?? 0));

  const nominator = (seat: number) => state.nominations.find((x) => x.day === state.day && x.target === seat)?.by;

  const pick = (value: number) => {
    const next = values.map((v, i) => (i === active ? value : v));
    setValues(next);
    const nextEmpty = next.findIndex((v, i) => v === null && i !== active);
    if (nextEmpty >= 0) setActive(nextEmpty);
  };

  const confirm = () => {
    if (complete && last >= 0) dispatch({ type: 'vote', votes: values as number[] });
  };

  return (
    <div className="vote">
      <div className="vote-rows">
        {candidates.map((c, i) => {
          const isLast = i === n - 1;
          const value = isLast ? (complete ? last : null) : values[i];
          const by = nominator(c);
          const isActive = !isLast && i === active;
          return (
            <button
              key={c}
              className={`vote-row ${isActive ? 'is-active' : ''} ${isLast ? 'is-auto' : ''}`}
              onClick={() => !isLast && setActive(i)}
              disabled={isLast}
            >
              <span className="vote-seat">№{c}</span>
              <span className="vote-meta">
                <span className="vote-nick">{nick(state, c)}</span>
                <span className="vote-by">
                  {isLast ? 'получает оставшиеся голоса' : by ? `выставил №${by}` : ''}
                </span>
              </span>
              <span className="vote-value">{value ?? (isLast ? '…' : '—')}</span>
            </button>
          );
        })}
      </div>

      {n > 1 && (
        <div>
          <div className="section-label">Сколько рук за №{candidates[active]}?</div>
          <NumberPad upTo={alive} max={maxForActive} value={values[active] ?? null} onPick={pick} />
        </div>
      )}

      <div className={`vote-result ${complete ? 'is-ready' : ''}`}>
        {complete
          ? leaders.length === 1
            ? `Уходит №${leaders[0]} · ${nick(state, leaders[0]!)}`
            : `Попил: ${list(leaders)}`
          : `Голосуют ${alive} игроков. Введите голоса по порядку.`}
      </div>

      <button className="btn btn-primary btn-lg btn-block" disabled={!complete || last < 0} onClick={confirm}>
        <span>Подтвердить голосование</span>
        <Kbd>Enter</Kbd>
      </button>
    </div>
  );
}

interface LiftAllProps {
  state: GameState;
  candidates: number[];
  dispatch: (event: GameEvent) => boolean;
}

export function LiftAllPanel({ state, candidates, dispatch }: LiftAllProps) {
  const alive = aliveCount(state);
  const [value, setValue] = useState<number | null>(null);
  const lifted = value !== null && value * 2 > alive;

  return (
    <div className="vote">
      <div>
        <div className="section-label">Сколько рук за подъём всех?</div>
        <NumberPad upTo={alive} max={alive} value={value} onPick={setValue} />
      </div>
      <div className={`vote-result ${value !== null ? 'is-ready' : ''}`}>
        {value === null
          ? `Нужно больше половины: ${Math.floor(alive / 2) + 1} из ${alive}.`
          : lifted
            ? `Уходят все: ${list(candidates)}`
            : 'Все остаются за столом'}
      </div>
      <button
        className="btn btn-primary btn-lg btn-block"
        disabled={value === null}
        onClick={() => value !== null && dispatch({ type: 'liftAllVote', votesFor: value })}
      >
        <span>Подтвердить</span>
        <Kbd>Enter</Kbd>
      </button>
    </div>
  );
}
