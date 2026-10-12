import { useEffect, useRef, useState } from 'react';
import {
  addTracks,
  listTracks,
  moveTrack,
  removeTrack,
  type MusicOrder,
  type Track,
} from '../../music/library';
import { music, useMusic } from '../../music/player';
import { ConfirmButton } from '../game/ConfirmButton';

interface Props {
  onBack: () => void;
}

function formatDuration(sec: number | null): string {
  if (sec === null) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

export function MusicScreen({ onBack }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const player = useMusic();
  const { settings } = player;

  const refresh = async () => {
    setTracks(await listTracks());
    await music.reload();
  };

  useEffect(() => {
    void refresh();
    // Уходя с экрана, останавливаем прослушивание.
    return () => void music.pause(false);
  }, []);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const added = await addTracks(Array.from(files));
      if (added.length === 0) setError('Среди выбранных файлов нет музыки. Подходят mp3, m4a, aac, ogg, wav.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить файлы.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
      await refresh();
    }
  };

  const update = (patch: Parameters<typeof music.updateSettings>[0]) => void music.updateSettings(patch);
  const playingId = player.status === 'playing' ? player.track?.id : undefined;
  const totalSize = tracks.reduce((a, t) => a + t.size, 0);

  return (
    <div className="screen music">
      <div className="setup-head">
        <button className="btn" onClick={onBack}>
          ← Назад
        </button>
        <h1 style={{ fontSize: 26 }}>Музыка для ночи</h1>
      </div>

      <p className="muted music-intro">
        Музыка сама включается в начале каждой ночи и плавно затихает, когда наступает утро. Файлы хранятся только на
        этом устройстве.
      </p>

      <div className="music-cols">
      <section className="card music-card">
        <div className="music-card-head">
          <div>
            <h2 className="music-h2">Композиции</h2>
            <div className="muted">
              {tracks.length ? `${tracks.length} шт. · ${formatSize(totalSize)}` : 'Пока ничего не загружено'}
            </div>
          </div>
          <label className={`btn btn-primary ${busy ? 'is-busy' : ''}`}>
            {busy ? 'Добавляю…' : 'Добавить файлы'}
            <input
              ref={input}
              type="file"
              accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav"
              multiple
              hidden
              disabled={busy}
              onChange={(e) => void onFiles(e.target.files)}
            />
          </label>
        </div>

        {error && <div className="note note-warn">{error}</div>}

        {tracks.length === 0 ? (
          <div className="music-empty">
            Нажмите «Добавить файлы» и выберите одну или несколько композиций. На iPad файлы берутся из приложения
            «Файлы».
          </div>
        ) : (
          <ol className="track-list">
            {tracks.map((t, i) => (
              <li key={t.id} className={`track ${playingId === t.id ? 'is-playing' : ''}`}>
                <span className="track-no">{i + 1}</span>
                <span className="track-info">
                  <span className="track-name">{t.name}</span>
                  <span className="track-meta">
                    {[formatDuration(t.duration), formatSize(t.size)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button
                  className="btn"
                  onClick={() => void (playingId === t.id ? music.pause(false) : music.playTrack(t.id))}
                >
                  {playingId === t.id ? 'Стоп' : 'Слушать'}
                </button>
                <button
                  className="btn btn-icon"
                  disabled={i === 0}
                  onClick={() => void moveTrack(t.id, -1).then(refresh)}
                  aria-label="Выше"
                >
                  ↑
                </button>
                <button
                  className="btn btn-icon"
                  disabled={i === tracks.length - 1}
                  onClick={() => void moveTrack(t.id, 1).then(refresh)}
                  aria-label="Ниже"
                >
                  ↓
                </button>
                <ConfirmButton
                  className="btn btn-danger"
                  confirmLabel="Удалить?"
                  onConfirm={() => void removeTrack(t.id).then(refresh)}
                >
                  Удалить
                </ConfirmButton>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card music-card">
        <h2 className="music-h2">Как играть</h2>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.autoplay}
            onChange={(e) => update({ autoplay: e.target.checked })}
          />
          <span>
            <b>Включать автоматически ночью</b>
            <span className="muted">Если выключить, музыку можно запускать вручную в игре.</span>
          </span>
        </label>

        <div className="setting">
          <div className="section-label">Порядок</div>
          <div className="segmented">
            {(
              [
                ['sequential', 'По очереди'],
                ['shuffle', 'Вперемешку'],
              ] as [MusicOrder, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className={settings.order === value ? 'is-on' : ''}
                onClick={() => update({ order: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <div className="section-label">Следующей ночью</div>
          <div className="segmented">
            <button className={settings.resume ? 'is-on' : ''} onClick={() => update({ resume: true })}>
              Продолжать с места остановки
            </button>
            <button className={!settings.resume ? 'is-on' : ''} onClick={() => update({ resume: false })}>
              Новая композиция
            </button>
          </div>
        </div>

        <div className="setting">
          <div className="section-label">Громкость: {Math.round(settings.volume * 100)}%</div>
          <input
            className="range"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
          />
        </div>

        <div className="setting">
          <div className="section-label">
            Плавное включение и затухание: {settings.fadeSec === 0 ? 'нет' : `${settings.fadeSec} с`}
          </div>
          <input
            className="range"
            type="range"
            min={0}
            max={5}
            step={0.5}
            value={settings.fadeSec}
            onChange={(e) => update({ fadeSec: Number(e.target.value) })}
          />
        </div>
      </section>
      </div>
    </div>
  );
}
