import { useEffect, useRef, useState } from 'react';
import { beepEnd, beepWarning } from '../audio/sound';
import { onTimerCommand } from './keys';
import { Kbd } from './PhasePanel';

interface Props {
  /** Длительность в секундах. Таймер пересоздаётся на каждую фазу через key. */
  duration: number;
  warningAt: number;
}

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Timer({ duration, warningAt }: Props) {
  const [remaining, setRemaining] = useState(duration * 1000);
  const [total, setTotal] = useState(duration * 1000);
  const [running, setRunning] = useState(false);
  const [ended, setEnded] = useState(false);
  const remainingRef = useRef(remaining);
  const endAt = useRef<number | null>(null);
  const warned = useRef(false);

  remainingRef.current = remaining;
  // Предупреждение имеет смысл, только если таймер длиннее порога.
  const warnEnabled = duration > warningAt;

  useEffect(() => {
    if (!running) {
      endAt.current = null;
      return;
    }
    endAt.current = Date.now() + remainingRef.current;
    const id = window.setInterval(() => {
      if (endAt.current === null) return;
      const left = endAt.current - Date.now();
      if (warnEnabled && !warned.current && left <= warningAt * 1000 && left > 0) {
        warned.current = true;
        beepWarning();
      }
      if (left <= 0) {
        window.clearInterval(id);
        setRemaining(0);
        setRunning(false);
        setEnded(true);
        beepEnd();
      } else {
        setRemaining(left);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [running, warnEnabled, warningAt]);

  const reset = () => {
    setRunning(false);
    setEnded(false);
    setRemaining(duration * 1000);
    setTotal(duration * 1000);
    warned.current = false;
  };

  const toggle = () => {
    if (ended || remaining <= 0) {
      reset();
      setRunning(true);
      return;
    }
    setRunning((r) => !r);
  };

  const addTen = () => {
    setEnded(false);
    setTotal((t) => Math.max(t, remainingRef.current + 10_000));
    if (running && endAt.current !== null) {
      endAt.current += 10_000;
      setRemaining(endAt.current - Date.now());
    } else {
      setRemaining((r) => r + 10_000);
    }
    if (remainingRef.current + 10_000 > warningAt * 1000) warned.current = false;
  };

  // Команды с клавиатуры: пробел, R, +.
  const handlers = useRef({ toggle, reset, addTen });
  handlers.current = { toggle, reset, addTen };
  useEffect(
    () =>
      onTimerCommand((cmd) => {
        const h = handlers.current;
        if (cmd === 'toggle') h.toggle();
        else if (cmd === 'reset') h.reset();
        else h.addTen();
      }),
    [],
  );

  const state = ended ? 'is-over' : warnEnabled && remaining <= warningAt * 1000 ? 'is-warn' : '';
  const progress = total > 0 ? Math.min(1, remaining / total) : 0;

  return (
    <div className={`timer ${state} ${running ? 'is-running' : ''}`}>
      <div className="timer-face">
        <span className="timer-digits">{format(remaining)}</span>
        <span className="timer-status">{ended ? 'Время вышло' : running ? 'Идёт' : 'На паузе'}</span>
      </div>
      <div className="timer-bar">
        <i style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="timer-controls">
        <button className={`btn ${running ? '' : 'btn-accent-outline'}`} onClick={toggle}>
          {running ? 'Пауза' : ended ? 'Заново' : 'Старт'}
          <Kbd>Пробел</Kbd>
        </button>
        <button className="btn" onClick={reset}>
          Сброс
          <Kbd>R</Kbd>
        </button>
        <button className="btn" onClick={addTen}>
          +10 с
          <Kbd>+</Kbd>
        </button>
      </div>
    </div>
  );
}
