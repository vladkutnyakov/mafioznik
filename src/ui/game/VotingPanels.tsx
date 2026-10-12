import { useContext, useEffect, useRef, useState } from 'react';
import { aliveCount, type GameEvent, type GameState } from '../../engine';
import { ModalOpenContext, digitFromKey, isEnter, isTyping } from './keys';
import { NumberPad } from './NumberPad';
import { Kbd } from './PhasePanel';
import { nick } from './rules';

const list = (seats: number[]) => seats.map((n) => `№${n}`).join(', ');

/**
 * Ввод числа с клавиатуры: цифры набираются подряд («1», «0» → 10).
 * Если следующая цифра уже не поместится в максимум, число считается введённым.
 */
function typeDigit(buffer: string, digit: number, max: number): { buffer: string; value: number | null; done: boolean } {
  const joined = Number(buffer + digit);
  if (buffer !== '' && joined <= max) return { buffer: buffer + digit, value: joined, done: joined * 10 > max };
  if (digit <= max) return { buffer: String(digit), value: digit, done: digit * 10 > max };
  return { buffer: '', value: null, done: false };
}

function useKeys(handler: (e: KeyboardEvent) => void) {
  const modalOpen = useContext(ModalOpenContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);
}

interface VotingProps {
  state: GameState;
  candidates: number[];
  dispatch: (event: GameEvent) => boolean;
}

/** Ввод голосов по кандидатам. Последнему кандидату голоса начисляются автоматически. */
export function VotingPanel({ state, candidates, dispatch }: VotingProps) {
  const alive = aliveCount(state);
  const n = candidates.length;
  const editable = Math.max(0, n - 1);
  const [values, setValues] = useState<(number | null)[]>(() => Array(editable).fill(null));
  const [active, setActive] = useState(0);
  const buffer = useRef('');

  const entered = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  const last = alive - entered;
  const full = [...values.map((v) => v ?? 0), last];
  const complete = values.every((v) => v !== null);
  const max = Math.max(...full);
  const leaders = candidates.filter((_, i) => full[i] === max);
  const maxForActive = alive - (entered - (values[active] ?? 0));

  const nominator = (seat: number) => state.nominations.find((x) => x.day === state.day && x.target === seat)?.by;

  const goTo = (i: number) => {
    buffer.current = '';
    setActive(i);
  };

  /** Записывает число за активного кандидата и, если нужно, переходит к следующему пустому. */
  const setValue = (value: number, advance: boolean) => {
    const next = values.map((v, i) => (i === active ? value : v));
    setValues(next);
    if (!advance) return;
    const nextEmpty = next.findIndex((v, i) => v === null && i !== active);
    if (nextEmpty >= 0) goTo(nextEmpty);
    else buffer.current = '';
  };

  const confirm = () => {
    if (complete && last >= 0) dispatch({ type: 'vote', votes: values as number[] });
  };

  useKeys((e) => {
    const digit = digitFromKey(e);
    if (digit !== null && editable > 0) {
      e.preventDefault();
      const r = typeDigit(buffer.current, digit, maxForActive);
      buffer.current = r.done ? '' : r.buffer;
      if (r.value !== null) setValue(r.value, r.done);
      return;
    }
    if (isEnter(e)) {
      e.preventDefault();
      if (e.repeat) return;
      if (complete) {
        confirm();
        return;
      }
      if (values[active] !== null) {
        const nextEmpty = values.findIndex((v) => v === null);
        if (nextEmpty >= 0) goTo(nextEmpty);
      }
      return;
    }
    if (e.code === 'Backspace') {
      e.preventDefault();
      buffer.current = '';
      setValues(values.map((v, i) => (i === active ? null : v)));
      return;
    }
    if (e.code === 'ArrowUp' && active > 0) {
      e.preventDefault();
      goTo(active - 1);
    }
    if (e.code === 'ArrowDown' && active < editable - 1) {
      e.preventDefault();
      goTo(active + 1);
    }
  });

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
              onClick={() => !isLast && goTo(i)}
              disabled={isLast}
            >
              <span className="vote-seat">№{c}</span>
              <span className="vote-meta">
                <span className="vote-nick">{nick(state, c)}</span>
                <span className="vote-by">{isLast ? 'получает оставшиеся голоса' : by ? `выставил №${by}` : ''}</span>
              </span>
              <span className="vote-value">{value ?? (isLast ? '…' : '—')}</span>
            </button>
          );
        })}
      </div>

      {editable > 0 && (
        <div>
          <div className="section-label">
            Сколько рук за №{candidates[active]}? Голосуют {alive}.
          </div>
          <NumberPad
            upTo={alive}
            max={maxForActive}
            value={values[active] ?? null}
            onPick={(v) => {
              buffer.current = '';
              setValue(v, true);
            }}
          />
        </div>
      )}

      {/* Итог голосования прямо в кнопке: отдельная строка под ним занимала место. */}
      <button className="btn btn-primary btn-lg btn-block" disabled={!complete || last < 0} onClick={confirm}>
        <span className="btn-label">
          {!complete
            ? 'Введите голоса по порядку'
            : leaders.length === 1
              ? `Подтвердить: уходит №${leaders[0]}`
              : `Попил: ${list(leaders)}`}
        </span>
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
  const buffer = useRef('');
  const lifted = value !== null && value * 2 > alive;

  const confirm = () => {
    if (value !== null) dispatch({ type: 'liftAllVote', votesFor: value });
  };

  useKeys((e) => {
    const digit = digitFromKey(e);
    if (digit !== null) {
      e.preventDefault();
      const r = typeDigit(buffer.current, digit, alive);
      buffer.current = r.done ? '' : r.buffer;
      if (r.value !== null) setValue(r.value);
      return;
    }
    if (isEnter(e)) {
      e.preventDefault();
      if (!e.repeat) confirm();
      return;
    }
    if (e.code === 'Backspace') {
      e.preventDefault();
      buffer.current = '';
      setValue(null);
    }
  });

  return (
    <div className="vote">
      <div>
        <div className="section-label">
          Сколько рук за подъём всех? Нужно {Math.floor(alive / 2) + 1} из {alive}.
        </div>
        <NumberPad
          upTo={alive}
          max={alive}
          value={value}
          onPick={(v) => {
            buffer.current = '';
            setValue(v);
          }}
        />
      </div>
      <button className="btn btn-primary btn-lg btn-block" disabled={value === null} onClick={confirm}>
        <span className="btn-label">
          {value === null
            ? 'Введите число голосов'
            : lifted
              ? `Подтвердить: уходят ${list(candidates)}`
              : 'Подтвердить: все остаются'}
        </span>
        <Kbd>Enter</Kbd>
      </button>
    </div>
  );
}
