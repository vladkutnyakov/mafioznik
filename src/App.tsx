import { useCallback, useEffect, useState } from 'react';
import type { GameSetup } from './engine';
import { newSession, type GameSession } from './session/session';
import { KEYS, kvDel, kvGet, kvSet } from './storage/db';
import { GameScreen } from './ui/screens/GameScreen';
import { HomeScreen } from './ui/screens/HomeScreen';
import { SetupScreen } from './ui/screens/SetupScreen';
import { unlockAudio } from './ui/audio/sound';
import { music } from './music/player';
import { MusicScreen } from './ui/screens/MusicScreen';

type Screen =
  | { name: 'loading' }
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'music' }
  | { name: 'game'; session: GameSession };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [active, setActive] = useState<GameSession | null>(null);
  const [historyCount, setHistoryCount] = useState(0);

  const refresh = useCallback(async () => {
    const [saved, history] = await Promise.all([
      kvGet<GameSession>(KEYS.activeSession),
      kvGet<GameSession[]>(KEYS.history),
    ]);
    setActive(saved ?? null);
    setHistoryCount(history?.length ?? 0);
  }, []);

  useEffect(() => {
    void refresh().then(() => setScreen({ name: 'home' }));
    void music.reload();
  }, [refresh]);

  // Звук в Safari разрешён только после касания экрана или нажатия клавиши.
  useEffect(() => {
    const onTouch = () => {
      unlockAudio();
      music.unlock();
    };
    window.addEventListener('pointerdown', onTouch);
    window.addEventListener('keydown', onTouch);
    return () => {
      window.removeEventListener('pointerdown', onTouch);
      window.removeEventListener('keydown', onTouch);
    };
  }, []);

  const startGame = async (setup: GameSetup) => {
    const session = newSession(setup);
    await kvSet(KEYS.activeSession, session);
    setActive(session);
    setScreen({ name: 'game', session });
  };

  const exitGame = async () => {
    await refresh();
    setScreen({ name: 'home' });
  };

  const saveGame = async (session: GameSession) => {
    const history = (await kvGet<GameSession[]>(KEYS.history)) ?? [];
    const finished = { ...session, redo: [], finishedAt: Date.now() };
    await kvSet(KEYS.history, [...history.filter((g) => g.id !== session.id), finished]);
    await kvDel(KEYS.activeSession);
    await exitGame();
  };

  const discardGame = async () => {
    await kvDel(KEYS.activeSession);
    await refresh();
  };

  switch (screen.name) {
    case 'loading':
      return null;
    case 'home':
      return (
        <HomeScreen
          active={active}
          historyCount={historyCount}
          onNew={() => setScreen({ name: 'setup' })}
          onMusic={() => setScreen({ name: 'music' })}
          onResume={(session) => setScreen({ name: 'game', session })}
          onDiscard={discardGame}
        />
      );
    case 'music':
      return <MusicScreen onBack={() => setScreen({ name: 'home' })} />;
    case 'setup':
      return <SetupScreen onBack={() => setScreen({ name: 'home' })} onStart={startGame} />;
    case 'game':
      return <GameScreen key={screen.session.id} initial={screen.session} onExit={exitGame} onSave={saveGame} />;
  }
}
