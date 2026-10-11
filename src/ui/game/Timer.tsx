import { useEffect, useRef, useState } from 'react';
import { beepEnd, beepWarning } from '../audio/sound';

interface Props {
  /** Длительность в секундах. */
  duration: number;
  /** При смене ключа таймер сбрасывается: новая фаза — новый отсчёт. */
  resetKey: string;
  warningAt: number;
  autoStart?: boolean;
}

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Timer({ duration, resetKey, warningAt, autoStart = false }: Props) {
  const [remaining, setRemaining] = useState(duration * 1000);
  const [running, setRunning] = useState(autoStart);
  const [ended, setEnded] = useState(false);
  const remainingRef = useRef(remaining);
  const endAt = useRef<number | null>(null);
  const warned = useRef(false);

  remainingRef.current = remaining;
  // Предупреждение имеет смысл, только если таймер длиннее порога.
  const warnEnabled = duration > warningAt;

  useEffect(() => {
    setRemaining(duration * 1000);
    remainingRef.current = duration * 1000;
    setRunning(autoStart);
    setEnded(false);
    endAt.current = null;
    warned.current = false;
  }, [resetKey, duration, autoStart]);

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

  const addTen = () => {
    setEnded(false);
    if (running && endAt.current !== null) {
      endAt.current += 10_000;
      setRemaining(endAt.current - Date.now());
    } else {
      setRemaining((r) => r + 10_000);
    }
    if (remainingRef.current + 10_000 > warningAt * 1000) warned.current = false;
  };

  const reset = () => {
    setRunning(false);
    setEnded(false);
    setRemaining(duration * 1000);
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

  const state = ended ? 'is-over' : warnEnabled && remaining <= warningAt * 1000 ? 'is-warn' : '';

  return (
    <div className={`timer ${state} ${running ? 'is-running' : ''}`}>
      <button className="timer-face" onClick={toggle} aria-label={running ? 'Пауза' : 'Старт'}>
        <span className="timer-digits">{format(remaining)}</span>
        <span className="timer-hint">{ended ? 'Время вышло' : running ? 'Нажмите для паузы' : 'Нажмите для старта'}</span>
      </button>
      <div className="timer-controls">
        <button className="btn" onClick={toggle}>
          {running ? '❚❚ Пауза' : '▶ Старт'}
        </button>
        <button className="btn" onClick={reset}>
          ↺ Сброс
        </button>
        <button className="btn" onClick={addTen}>
          +10 с
        </button>
      </div>
    </div>
  );
}
