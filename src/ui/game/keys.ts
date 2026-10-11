import { createContext } from 'react';

// Клавиши определяются по физической кнопке (event.code), поэтому работают в любой раскладке.

/** Номер игрока по цифре: 1–9 как есть, 0 означает №10. */
export function seatFromKey(e: KeyboardEvent): number | null {
  const d = digitFromKey(e);
  if (d === null) return null;
  return d === 0 ? 10 : d;
}

/** Цифра 0–9 с основной клавиатуры или цифрового блока. */
export function digitFromKey(e: KeyboardEvent): number | null {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  return m ? Number(m[1]) : null;
}

export const isEnter = (e: KeyboardEvent) => e.code === 'Enter' || e.code === 'NumpadEnter';

/** Фокус в поле ввода: горячие клавиши не перехватываем. */
export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** Снимает фокус с кнопки, чтобы Enter и пробел не нажимали её второй раз. */
export function blurActive(): void {
  const el = document.activeElement as HTMLElement | null;
  if (el && el !== document.body && typeof el.blur === 'function') el.blur();
}

// ---------- команды таймеру ----------

export type TimerCommand = 'toggle' | 'reset' | 'add';

const timerBus = new EventTarget();

export function sendTimer(cmd: TimerCommand): void {
  timerBus.dispatchEvent(new CustomEvent<TimerCommand>('cmd', { detail: cmd }));
}

export function onTimerCommand(handler: (cmd: TimerCommand) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<TimerCommand>).detail);
  timerBus.addEventListener('cmd', listener);
  return () => timerBus.removeEventListener('cmd', listener);
}

/** Открыто ли модальное окно: тогда панели голосования не перехватывают клавиши. */
export const ModalOpenContext = createContext(false);
