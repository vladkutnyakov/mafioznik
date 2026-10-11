import { describePhase } from '../../engine';
import type { GameSession } from '../../session/session';
import { useGameSession } from '../../session/useGameSession';

interface Props {
  initial: GameSession;
  onExit: () => void;
  onSave: (session: GameSession) => void;
}

/** Временная заглушка: игровой экран делается следующей задачей. */
export function GameScreen({ initial, onExit }: Props) {
  const game = useGameSession(initial);
  const d = describePhase(game.state);
  return (
    <div className="screen">
      <button className="btn" onClick={onExit}>
        ← В меню
      </button>
      <h2 style={{ marginTop: 16 }}>{d.title}</h2>
      <p>{d.prompt}</p>
      <button className="btn btn-primary" onClick={() => game.dispatch({ type: 'advance' })}>
        Дальше
      </button>
    </div>
  );
}
