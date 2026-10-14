import { useCallback, useEffect, useState } from 'react';
import type { GameSetup } from './engine';
import { newSession, type GameSession } from './session/session';
import { KEYS, kvDel, kvGet, kvSet } from './storage/db';
import { folderState, getArchive, saveFinishedGame, syncFolder, type FolderState } from './storage/archive';
import { GameScreen } from './ui/screens/GameScreen';
import { HomeScreen } from './ui/screens/HomeScreen';
import { SetupScreen } from './ui/screens/SetupScreen';
import { unlockAudio } from './ui/audio/sound';
import { music } from './music/player';
import { MusicScreen } from './ui/screens/MusicScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { HistoryScreen } from './ui/screens/HistoryScreen';

type Screen =
  | { name: 'loading' }
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'music' }
  | { name: 'settings' }
  | { name: 'history' }
  | { name: 'game'; session: GameSession };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [active, setActive] = useState<GameSession | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [folder, setFolder] = useState<FolderState>({ kind: 'none' });

  const refresh = useCallback(async () => {
    const [saved, archive, state] = await Promise.all([kvGet<GameSession>(KEYS.activeSession), getArchive(), folderState()]);
    setActive(saved ?? null);
    setHistoryCount(archive.games.length);
    setFolder(state);
  }, []);

  useEffect(() => {
    void refresh().then(() => setScreen({ name: 'home' }));
    // Подтягиваем игры из папки, если доступ к ней браузер помнит.
    void syncFolder().then((r) => r && refresh());
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
    await saveFinishedGame({ ...session, finishedAt: Date.now() });
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
          folder={folder}
          onNew={() => setScreen({ name: 'setup' })}
          onMusic={() => setScreen({ name: 'music' })}
          onSettings={() => setScreen({ name: 'settings' })}
          onHistory={() => setScreen({ name: 'history' })}
          onResume={(session) => setScreen({ name: 'game', session })}
          onDiscard={discardGame}
        />
      );
    case 'music':
      return <MusicScreen onBack={() => setScreen({ name: 'home' })} />;
    case 'settings':
      return <SettingsScreen onBack={() => void refresh().then(() => setScreen({ name: 'home' }))} />;
    case 'history':
      return <HistoryScreen onBack={() => setScreen({ name: 'home' })} />;
    case 'setup':
      return <SetupScreen onBack={() => setScreen({ name: 'home' })} onStart={startGame} />;
    case 'game':
      return <GameScreen key={screen.session.id} initial={screen.session} onExit={exitGame} onSave={saveGame} />;
  }
}
