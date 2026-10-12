// Звуковые сигналы таймера на Web Audio: не требуют файлов и работают офлайн.

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  return getCtx();
}

/** Уже созданный звуковой контекст, без создания нового: до касания экрана его создавать нельзя. */
export function peekAudioContext(): AudioContext | null {
  return ctx;
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Вызывается по касанию экрана: Safari разрешает звук только после действия пользователя. */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

function tone(freq: number, start: number, duration: number, volume = 0.25): void {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Короткий сигнал: скоро конец времени. */
export function beepWarning(): void {
  tone(880, 0, 0.18);
}

/** Сигнал окончания времени. */
export function beepEnd(): void {
  tone(660, 0, 0.25, 0.35);
  tone(660, 0.32, 0.25, 0.35);
  tone(440, 0.64, 0.5, 0.35);
}
