import { useEffect, useState } from 'react';
import { music, useMusic } from '../../music/player';
import { Kbd } from './PhasePanel';

/** Мини-плеер в верхней панели игры. */
export function MusicControl() {
  const m = useMusic();
  const [open, setOpen] = useState(false);
  const playing = m.status === 'playing';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const label = m.status === 'blocked' ? 'Включить музыку' : 'Музыка';
  const stateClass = playing ? 'is-playing' : m.status === 'blocked' ? 'is-blocked' : '';

  return (
    <div className="menu-wrap">
      <button
        className={`btn music-btn ${stateClass}`}
        onClick={() => {
          if (m.status === 'blocked') void music.play(true);
          else setOpen((v) => !v);
        }}
        aria-expanded={open}
      >
        {playing && <i className="dot music-dot" />}
        {label}
        <Kbd>M</Kbd>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu music-menu" role="dialog" aria-label="Музыка">
            {m.trackCount === 0 ? (
              <div className="muted">
                Музыка не загружена. Добавьте композиции в главном меню, раздел «Музыка для ночи».
              </div>
            ) : (
              <>
                <div>
                  <div className="section-label">{playing ? 'Сейчас играет' : 'На паузе'}</div>
                  <div className="music-now">{m.track?.name ?? 'Ещё не включалась'}</div>
                </div>
                <div className="row">
                  <button className="btn" onClick={() => void music.toggle()}>
                    {playing ? 'Пауза' : 'Играть'}
                  </button>
                  <button className="btn" onClick={() => void music.next()}>
                    Следующая
                  </button>
                </div>
                <div>
                  <div className="section-label">Громкость: {Math.round(m.settings.volume * 100)}%</div>
                  <input
                    className="range"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={m.settings.volume}
                    onChange={(e) => void music.updateSettings({ volume: Number(e.target.value) })}
                  />
                </div>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={m.settings.autoplay}
                    onChange={(e) => void music.updateSettings({ autoplay: e.target.checked })}
                  />
                  <span>
                    <b>Включать ночью автоматически</b>
                  </span>
                </label>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
