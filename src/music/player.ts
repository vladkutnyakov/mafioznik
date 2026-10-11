// Плеер музыки для ночи: один аудиоэлемент на всё приложение.
// Громкость и затухание идут через Web Audio: на iPad громкость тега audio менять нельзя.

import { useSyncExternalStore } from 'react';
import { getAudioContext } from '../ui/audio/sound';
import {
  DEFAULT_MUSIC_SETTINGS,
  getTrackFile,
  listTracks,
  loadMusicSettings,
  pickNextIndex,
  saveMusicSettings,
  type MusicSettings,
  type Track,
} from './library';

export type MusicStatus = 'idle' | 'playing' | 'paused' | 'blocked';

export interface MusicState {
  status: MusicStatus;
  track: Track | null;
  trackCount: number;
  settings: MusicSettings;
}

// Короткая тишина: ею «разблокируется» аудиоэлемент по первому касанию (требование Safari).
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

class MusicPlayer {
  private audio: HTMLAudioElement | null = typeof Audio !== 'undefined' ? new Audio() : null;
  private gain: GainNode | null = null;
  private wired = false;
  private unlocked = false;
  private tracks: Track[] = [];
  private settings: MusicSettings = DEFAULT_MUSIC_SETTINGS;
  private index: number | null = null;
  private url: string | null = null;
  /** Следующей ночью нужен новый трек (режим «новый трек каждую ночь»). */
  private freshNext = false;
  private night = false;
  private blocked = false;
  /** Номер последней операции: устаревшее затухание не должно останавливать новое воспроизведение. */
  private op = 0;
  private listeners = new Set<() => void>();
  private snapshot: MusicState = this.makeSnapshot();

  constructor() {
    if (!this.audio) return;
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => void this.onEnded());
    this.audio.addEventListener('play', () => this.emit());
    this.audio.addEventListener('pause', () => this.emit());
  }

  // ---------- подписка для интерфейса ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): MusicState => this.snapshot;

  private makeSnapshot(): MusicState {
    const playing = this.audio !== null && !this.audio.paused && this.url !== null;
    return {
      status: this.blocked ? 'blocked' : playing ? 'playing' : this.url ? 'paused' : 'idle',
      track: this.index !== null ? (this.tracks[this.index] ?? null) : null,
      trackCount: this.tracks.length,
      settings: this.settings,
    };
  }

  private emit(): void {
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((fn) => fn());
  }

  // ---------- загрузка ----------

  /** Перечитывает библиотеку и настройки. Вызывается при старте и после изменений библиотеки. */
  async reload(): Promise<void> {
    const currentId = this.index !== null ? this.tracks[this.index]?.id : undefined;
    const [tracks, settings] = await Promise.all([listTracks(), loadMusicSettings()]);
    this.tracks = tracks;
    this.settings = settings;
    const newIndex = currentId ? tracks.findIndex((t) => t.id === currentId) : -1;
    if (newIndex >= 0) {
      this.index = newIndex;
    } else if (currentId) {
      // Играющий трек удалили из библиотеки.
      this.audio?.pause();
      this.releaseUrl();
      this.index = null;
    }
    this.applyVolume(this.isPlaying() ? this.settings.volume : 0);
    this.emit();
  }

  async updateSettings(patch: Partial<MusicSettings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    if (patch.volume !== undefined && this.isPlaying()) this.applyVolume(this.settings.volume);
    this.emit();
    await saveMusicSettings(this.settings);
  }

  // ---------- разблокировка звука ----------

  /** Вызывается по первому касанию: Safari разрешает звук только после действия пользователя. */
  unlock(): void {
    if (!this.audio) return;
    this.wire();
    if (this.blocked && this.night) {
      this.blocked = false;
      void this.play(true);
      return;
    }
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.url) return;
    this.audio.src = SILENCE;
    this.audio.play().then(
      () => this.audio?.pause(),
      () => undefined,
    );
  }

  private wire(): void {
    if (this.wired || !this.audio) return;
    this.wired = true;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const source = ctx.createMediaElementSource(this.audio);
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      source.connect(this.gain).connect(ctx.destination);
    } catch {
      this.gain = null;
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  // ---------- громкость ----------

  private isPlaying(): boolean {
    return this.audio !== null && !this.audio.paused;
  }

  private applyVolume(value: number): void {
    const ctx = getAudioContext();
    if (this.gain && ctx) {
      this.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.gain.gain.setValueAtTime(value, ctx.currentTime);
    } else if (this.audio) {
      this.audio.volume = value;
    }
  }

  private fadeTo(target: number, seconds: number): Promise<void> {
    const ctx = getAudioContext();
    if (seconds <= 0) {
      this.applyVolume(target);
      return Promise.resolve();
    }
    if (this.gain && ctx) {
      const g = this.gain.gain;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(target, now + seconds);
    } else if (this.audio) {
      const audio = this.audio;
      const from = audio.volume;
      const started = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - started) / (seconds * 1000));
        audio.volume = from + (target - from) * k;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    return new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
  }

  // ---------- треки ----------

  private releaseUrl(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private async loadTrack(i: number): Promise<boolean> {
    const track = this.tracks[i];
    if (!track || !this.audio) return false;
    const file = await getTrackFile(track.id);
    if (!file) return false;
    this.releaseUrl();
    this.url = URL.createObjectURL(file);
    this.audio.src = this.url;
    this.index = i;
    this.emit();
    return true;
  }

  private async loadNext(): Promise<boolean> {
    const i = pickNextIndex(this.index, this.tracks.length, this.settings.order);
    return i >= 0 && this.loadTrack(i);
  }

  // ---------- управление ----------

  async play(fade = true): Promise<void> {
    if (!this.audio || this.tracks.length === 0) return;
    const op = ++this.op;
    this.wire();
    const ctx = getAudioContext();
    if (ctx?.state === 'suspended') await ctx.resume().catch(() => undefined);
    if (!this.url || this.freshNext) {
      this.freshNext = false;
      if (!(await this.loadNext())) return;
    }
    if (op !== this.op) return;
    this.applyVolume(fade ? 0 : this.settings.volume);
    try {
      await this.audio.play();
      this.blocked = false;
    } catch {
      // Браузер не разрешил звук без касания экрана: включим по первому касанию.
      this.blocked = true;
      this.emit();
      return;
    }
    this.emit();
    await this.fadeTo(this.settings.volume, fade ? this.settings.fadeSec : 0);
  }

  async pause(fade = true): Promise<void> {
    if (!this.audio || this.audio.paused) {
      this.blocked = false;
      this.emit();
      return;
    }
    const op = ++this.op;
    await this.fadeTo(0, fade ? this.settings.fadeSec : 0);
    if (op !== this.op) return;
    this.audio.pause();
  }

  async toggle(): Promise<void> {
    if (this.isPlaying()) await this.pause(true);
    else await this.play(true);
  }

  async next(): Promise<void> {
    const wasPlaying = this.isPlaying();
    this.op++;
    if (!(await this.loadNext())) return;
    if (wasPlaying) await this.play(false);
  }

  /** Включить конкретный трек: прослушивание в библиотеке или выбор вручную. */
  async playTrack(id: string): Promise<void> {
    const i = this.tracks.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.op++;
    this.freshNext = false;
    if (this.index !== i || !this.url) {
      if (!(await this.loadTrack(i))) return;
    }
    await this.play(false);
  }

  private async onEnded(): Promise<void> {
    // Трек закончился посреди ночи: включаем следующий.
    if (!this.night) return;
    if (await this.loadNext()) await this.play(false);
  }

  /** Наступила ночь. */
  async startNight(): Promise<void> {
    this.night = true;
    if (!this.settings.autoplay || this.tracks.length === 0) return;
    await this.play(true);
  }

  /** Ночь закончилась: плавно затихаем. */
  async stopNight(): Promise<void> {
    if (!this.night) return;
    this.night = false;
    if (!this.settings.resume) this.freshNext = true;
    await this.pause(true);
  }
}

export const music = new MusicPlayer();

export function useMusic(): MusicState {
  return useSyncExternalStore(music.subscribe, music.getState);
}
