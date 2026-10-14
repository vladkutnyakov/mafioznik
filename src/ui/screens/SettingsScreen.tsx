import { useEffect, useState } from 'react';
import {
  chooseFolder,
  folderState,
  forgetFolder,
  getArchive,
  lastSync,
  syncFolder,
  unlockFolder,
  type FolderState,
  type SyncResult,
} from '../../storage/archive';
import { ConfirmButton } from '../game/ConfirmButton';

interface Props {
  onBack: () => void;
}

interface Counts {
  games: number;
  players: number;
  tournaments: number;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

function describeSync(r: SyncResult): string {
  const time = new Date(r.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (r.error) return `Ошибка синхронизации в ${time}: ${r.error}`;
  const written = r.written ? `, записано ${r.written} ${plural(r.written, 'игра', 'игры', 'игр')}` : '';
  return `Синхронизировано в ${time}${written}.`;
}

export function SettingsScreen({ onBack }: Props) {
  const [folder, setFolder] = useState<FolderState | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [sync, setSync] = useState<SyncResult | undefined>(lastSync);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const [state, archive] = await Promise.all([folderState(), getArchive()]);
    setFolder(state);
    setCounts({ games: archive.games.length, players: archive.players.length, tournaments: archive.tournaments.length });
  };

  useEffect(() => {
    void refresh();
  }, []);

  const run = async (action: () => Promise<SyncResult | undefined | void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result) setSync(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Что-то пошло не так.');
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const disconnect = () =>
    run(async () => {
      await forgetFolder();
      setSync(undefined);
    });

  return (
    <div className="screen settings">
      <div className="setup-head">
        <button className="btn" onClick={onBack}>
          ← Назад
        </button>
        <h1 style={{ fontSize: 26 }}>Настройки</h1>
      </div>

      <section className="card settings-card">
        <h2 className="music-h2">Папка с историей игр</h2>
        <p className="muted settings-text">
          Завершённые игры, игроки и турниры сохраняются в выбранную папку на компьютере: каждая игра в отдельный файл.
          Статистика считается по этим играм. Папку можно положить в Яндекс Диск или Google Drive, тогда история будет
          в облаке.
        </p>

        {folder?.kind === 'unsupported' && (
          <div className="note note-warn">
            Этот браузер не умеет работать с папками. Откройте Мафиозник в Chrome, Edge или Яндекс Браузере. Пока игры
            хранятся только в этом браузере.
          </div>
        )}

        {folder && folder.kind !== 'unsupported' && (
          <div className="settings-folder">
            <div className="settings-folder-name">
              {folder.kind === 'none' ? (
                <span className="muted">Папка не выбрана, игры хранятся только в браузере.</span>
              ) : (
                <>
                  <span className="settings-folder-icon" aria-hidden>
                    📁
                  </span>
                  <b>{folder.name}</b>
                  {folder.kind === 'locked' && <span className="muted"> · нужен доступ</span>}
                </>
              )}
            </div>
            <div className="row wrap">
              {folder.kind === 'locked' && (
                <button className="btn btn-primary" disabled={busy} onClick={() => run(unlockFolder)}>
                  Разрешить доступ
                </button>
              )}
              {folder.kind === 'ready' && (
                <button className="btn btn-primary" disabled={busy} onClick={() => run(syncFolder)}>
                  Синхронизировать
                </button>
              )}
              <button className={`btn ${folder.kind === 'none' ? 'btn-primary' : ''}`} disabled={busy} onClick={() => run(chooseFolder)}>
                {folder.kind === 'none' ? 'Выбрать папку' : 'Выбрать другую'}
              </button>
              {folder.kind !== 'none' && (
                <ConfirmButton confirmLabel="Точно отключить?" disabled={busy} onConfirm={() => void disconnect()}>
                  Отключить
                </ConfirmButton>
              )}
            </div>
            {folder.kind === 'locked' && (
              <div className="muted settings-hint">
                Браузер спрашивает разрешение после перезапуска. Чтобы не спрашивал, выберите «Разрешать при каждом
                посещении».
              </div>
            )}
          </div>
        )}

        {busy && <div className="muted">Синхронизация…</div>}
        {error && <div className="note note-warn">{error}</div>}
        {sync && !busy && <div className={`note ${sync.error ? 'note-warn' : 'note-info'}`}>{describeSync(sync)}</div>}
        {sync && sync.broken.length > 0 && (
          <div className="note note-warn">
            Не удалось прочитать {sync.broken.length} {plural(sync.broken.length, 'файл', 'файла', 'файлов')} в папке
            games: {sync.broken.join(', ')}
          </div>
        )}

        {counts && (
          <div className="muted">
            В архиве: {counts.games} {plural(counts.games, 'игра', 'игры', 'игр')} · {counts.players}{' '}
            {plural(counts.players, 'игрок', 'игрока', 'игроков')} · {counts.tournaments}{' '}
            {plural(counts.tournaments, 'турнир', 'турнира', 'турниров')}
          </div>
        )}

        <details className="settings-details">
          <summary>Что лежит в папке</summary>
          <pre className="settings-tree">{`mafioznik.json     метка папки и версия формата
players.json       игроки
tournaments.json   турниры
games/             по файлу на каждую игру
  2026-10-14_19-30_Осенний-кубок_игра-3_1a2b3c4d.json`}</pre>
          <p className="muted settings-text">
            Удалённый из папки файл игры пропадёт и из приложения при следующей синхронизации. Ник игрока можно поправить
            в players.json: в играх игрок записан по id.
          </p>
        </details>
      </section>
    </div>
  );
}
