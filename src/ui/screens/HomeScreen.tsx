import { useMemo, useState } from 'react';
import { describePhase } from '../../engine';
import { sessionState, type GameSession } from '../../session/session';

interface Props {
  active: GameSession | null;
  historyCount: number;
  onNew: () => void;
  onResume: (session: GameSession) => void;
  onDiscard: () => void;
}

export function HomeScreen({ active, historyCount, onNew, onResume, onDiscard }: Props) {
  const [armDiscard, setArmDiscard] = useState(false);

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
            <div className="muted">Незавершённая партия</div>
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

        <div className="muted" style={{ fontSize: 14, textAlign: 'center' }}>
          Сохранённых игр: {historyCount}
        </div>
      </div>
    </div>
  );
}
