import { useState } from 'react';
import { aliveCount, type GameEvent, type GameState } from '../../engine';
import { NumberPad } from './NumberPad';

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

  const nominator = (seat: number) => state.nominations.find((x) => x.day === state.day && x.target === seat)?.by;

  const pick = (value: number) => {
    const next = values.map((v, i) => (i === active ? value : v));
    setValues(next);
    const nextEmpty = next.findIndex((v, i) => v === null && i !== active);
    if (nextEmpty >= 0) setActive(nextEmpty);
    else if (active < next.length - 1) setActive(active + 1);
  };

  const maxForActive = alive - (entered - (values[active] ?? 0));

  return (
    <div className="vote">
      <div className="vote-rows">
        {candidates.map((c, i) => {
          const isLast = i === n - 1;
          const value = isLast ? last : values[i];
          const by = nominator(c);
          return (
            <button
              key={c}
              className={`vote-row ${!isLast && i === active ? 'is-active' : ''} ${isLast ? 'is-auto' : ''}`}
              onClick={() => !isLast && setActive(i)}
              disabled={isLast}
            >
              <span className="vote-seat">№{c}</span>
              <span className="muted vote-by">{by ? `выставил №${by}` : ''}</span>
              <span className="vote-value">{value ?? '—'}</span>
              {isLast && <span className="vote-auto">остальные</span>}
            </button>
          );
        })}
      </div>

      {n > 1 && <NumberPad upTo={alive} max={maxForActive} value={values[active] ?? null} onPick={pick} />}

      <div className="vote-summary">
        Живых игроков: {alive}.{' '}
        {complete ? (
          leaders.length === 1 ? (
            <b>Уходит №{leaders[0]}</b>
          ) : (
            <b>Попил: {list(leaders)}</b>
          )
        ) : (
          'Введите голоса за каждого кандидата.'
        )}
      </div>

      <button
        className="btn btn-primary btn-lg btn-block"
        disabled={!complete || last < 0}
        onClick={() => dispatch({ type: 'vote', votes: values as number[] })}
      >
        Подтвердить голосование
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
      <div className="muted">Сколько игроков за то, чтобы {list(candidates)} покинули стол?</div>
      <NumberPad upTo={alive} max={alive} value={value} onPick={setValue} />
      <div className="vote-summary">
        Нужно больше половины: {Math.floor(alive / 2) + 1} из {alive}.{' '}
        {value !== null && <b>{lifted ? `Уходят все: ${list(candidates)}` : 'Все остаются'}</b>}
      </div>
      <button
        className="btn btn-primary btn-lg btn-block"
        disabled={value === null}
        onClick={() => value !== null && dispatch({ type: 'liftAllVote', votesFor: value })}
      >
        Подтвердить
      </button>
    </div>
  );
}
