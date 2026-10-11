import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
}

/** Не даёт экрану погаснуть, пока открыт игровой экран. */
export function useWakeLock(active = true): void {
  useEffect(() => {
    const wl = (navigator as unknown as WakeLockNavigator).wakeLock;
    if (!active || !wl) return;
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const next = await wl.request('screen');
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        // Браузер отказал: например, вкладка не активна или режим энергосбережения.
      }
    };

    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
