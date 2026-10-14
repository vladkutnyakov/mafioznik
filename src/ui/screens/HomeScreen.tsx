import { useMemo, useState } from 'react';
import { describePhase } from '../../engine';
import { useMusic } from '../../music/player';
import { sessionState, type GameSession } from '../../session/session';
import type { FolderState } from '../../storage/archive';

interface Props {
  active: GameSession | null;
  historyCount: number;
  folder: FolderState;
  onNew: () => void;
  onMusic: () => void;
  onSettings: () => void;
  onHistory: () => void;
  onResume: (session: GameSession) => void;
  onDiscard: () => void;
}

const FOLDER_LABEL: Record<FolderState['kind'], (name: string) => string> = {
  unsupported: () => 'только в браузере',
  none: () => 'не выбрана',
  locked: () => 'нужен доступ',
  ready: (name) => name,
};

export function HomeScreen({ active, historyCount, folder, onNew, onMusic, onSettings, onHistory, onResume, onDiscard }: Props) {
  const [armDiscard, setArmDiscard] = useState(false);
  const { trackCount } = useMusic();

  const activeTitle = useMemo(() => {
    if (!active) return null;
    try {
      return describePhase(sessionState(active)).title;
    } catch {
      return 'Партия';
    }
  }, [active]);

  return (
    <div className="screen home">
      <div className="home-inner">
        <div>
          <div className="home-title">Мафиозник</div>
          <div className="muted">Помощник ведущего спортивной мафии</div>
        </div>

        {active && (
          <div className="card resume-card">
            <div className="muted">
              {active.setup.tournament
                ? `${active.setup.tournament.name} · игра ${active.setup.tournament.game} из ${active.setup.tournament.games}`
                : 'Незавершённая партия'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{activeTitle}</div>
            <div className="muted" style={{ fontSize: 14 }}>
              Начата {new Date(active.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-lg spacer" onClick={() => onResume(active)}>
                Продолжить
              </button>
              <button
                className={`btn btn-danger ${armDiscard ? 'is-armed' : ''}`}
                onClick={() => {
                  if (armDiscard) {
                    setArmDiscard(false);
                    onDiscard();
                  } else setArmDiscard(true);
                }}
              >
                {armDiscard ? 'Точно удалить?' : 'Удалить'}
              </button>
            </div>
          </div>
        )}

        <button className={`btn btn-lg btn-block ${active ? '' : 'btn-primary'}`} onClick={onNew}>
          Новая игра
        </button>

        <button className="btn btn-block home-link" disabled={!historyCount} onClick={onHistory}>
          <span>История и статистика</span>
          <span className="muted">{historyCount ? `${historyCount} шт.` : 'игр пока нет'}</span>
        </button>

        <button className="btn btn-block home-link" onClick={onMusic}>
          <span>Музыка для ночи</span>
          <span className="muted">{trackCount ? `${trackCount} шт.` : 'не загружена'}</span>
        </button>

        <button className={`btn btn-block home-link ${folder.kind === 'locked' ? 'btn-warn' : ''}`} onClick={onSettings}>
          <span>Папка с историей игр</span>
          <span className={folder.kind === 'locked' ? '' : 'muted'}>{FOLDER_LABEL[folder.kind]('name' in folder ? folder.name : '')}</span>
        </button>
      </div>
    </div>
  );
}
