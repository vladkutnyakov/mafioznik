import { useEffect, useMemo, useState } from 'react';
import {
  FIIM_REGULATION,
  ROLE_COUNTS,
  ROLE_NAMES,
  ROLE_TEAM,
  SEAT_COUNT,
  validateSetup,
  type GameSetup,
  type Role,
  type Timings,
} from '../../engine';
import { KEYS, kvGet, kvSet } from '../../storage/db';
import { TimingsEditor } from '../setup/TimingsEditor';

interface Props {
  onBack: () => void;
  onStart: (setup: GameSetup) => void | Promise<void>;
}

interface Row {
  nickname: string;
  role: Role;
}

const ROLE_ORDER: Role[] = ['civilian', 'sheriff', 'mafia', 'don'];
const ROLE_SHORT: Record<Role, string> = { civilian: 'Мир', sheriff: 'Шер', mafia: 'Маф', don: 'Дон' };

const emptyRows = (): Row[] => Array.from({ length: SEAT_COUNT }, () => ({ nickname: '', role: 'civilian' }));

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function randomRoles(): Role[] {
  const pool = ROLE_ORDER.flatMap((r) => Array<Role>(ROLE_COUNTS[r]).fill(r));
  return shuffle(pool);
}

export function SetupScreen({ onBack, onStart }: Props) {
  const [rows, setRows] = useState<Row[]>(emptyRows);
  const [known, setKnown] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [timings, setTimings] = useState<Timings>({ ...FIIM_REGULATION.timings });

  // Подставляем состав прошлой игры: за вечер обычно играют одни и те же люди.
  useEffect(() => {
    void Promise.all([kvGet<string[]>(KEYS.lastLineup), kvGet<string[]>(KEYS.knownNicknames)]).then(
      ([lineup, names]) => {
        if (lineup?.length === SEAT_COUNT) setRows(lineup.map((nickname) => ({ nickname, role: 'civilian' })));
        setKnown(names ?? []);
      },
    );
    // Тайминги прошлой игры: клуб обычно играет по одним и тем же.
    void kvGet<Partial<Timings>>(KEYS.lastTimings).then((saved) => {
      if (saved) setTimings({ ...FIIM_REGULATION.timings, ...saved });
    });
  }, []);

  const setup: GameSetup = useMemo(
    () => ({
      regulation: { ...FIIM_REGULATION, timings },
      seats: rows.map((r) => ({ player: { nickname: r.nickname.trim() }, role: r.role })),
    }),
    [rows, timings],
  );

  const errors = useMemo(() => {
    const list = validateSetup(setup);
    const names = rows.map((r) => r.nickname.trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) list.push('Есть повторяющиеся ники.');
    return list;
  }, [setup, rows]);

  const counts = useMemo(() => {
    const c: Record<Role, number> = { civilian: 0, sheriff: 0, mafia: 0, don: 0 };
    rows.forEach((r) => (c[r.role] += 1));
    return c;
  }, [rows]);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const start = async () => {
    if (errors.length || starting) return;
    setStarting(true);
    const nicknames = rows.map((r) => r.nickname.trim());
    const merged = Array.from(new Set([...nicknames, ...known])).slice(0, 500);
    await Promise.all([
      kvSet(KEYS.lastLineup, nicknames),
      kvSet(KEYS.knownNicknames, merged),
      kvSet(KEYS.lastTimings, timings),
    ]);
    await onStart(setup);
  };

  return (
    <div className="screen">
      <div className="setup-head">
        <button className="icon-btn" onClick={onBack} aria-label="Назад">
          ←
        </button>
        <h1 style={{ fontSize: 26 }}>Новая игра</h1>
        <div className="spacer" />
        <span className="muted">Регламент: {FIIM_REGULATION.name}</span>
      </div>

      <div className="row wrap" style={{ marginBottom: 16 }}>
        <div className="counters">
          {ROLE_ORDER.map((r) => (
            <span key={r} className={`counter ${counts[r] === ROLE_COUNTS[r] ? 'is-ok' : 'is-bad'}`}>
              {ROLE_NAMES[r]}: {counts[r]}/{ROLE_COUNTS[r]}
            </span>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setRows((prev) => prev.map((r) => ({ ...r, role: 'civilian' })))}>
          Сбросить роли
        </button>
        <button
          className="btn"
          onClick={() => {
            const roles = randomRoles();
            setRows((prev) => prev.map((r, i) => ({ ...r, role: roles[i]! })));
          }}
        >
          Случайные роли
        </button>
        <button
          className="btn"
          onClick={() => {
            const names = shuffle(rows.map((r) => r.nickname));
            setRows((prev) => prev.map((r, i) => ({ ...r, nickname: names[i]! })));
          }}
        >
          Перемешать места
        </button>
        <button className="btn btn-ghost" onClick={() => setRows(emptyRows())}>
          Очистить
        </button>
      </div>

      <datalist id="known-nicknames">
        {known.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="setup-grid">
        {rows.map((row, i) => (
          <div className="setup-row" key={i}>
            <div className="seat-num">{i + 1}</div>
            <input
              className="nick-input"
              value={row.nickname}
              placeholder="Ник игрока"
              list="known-nicknames"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="next"
              onChange={(e) => update(i, { nickname: e.target.value })}
              onKeyDown={(e) => {
                // Enter переводит к следующему игроку: удобно вводить состав с клавиатуры.
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const inputs = document.querySelectorAll<HTMLInputElement>('.nick-input');
                inputs[i + 1]?.focus();
                if (i === inputs.length - 1) e.currentTarget.blur();
              }}
            />
            <div className="role-picker" role="radiogroup" aria-label={`Роль места ${i + 1}`}>
              {ROLE_ORDER.map((r) => (
                <button
                  key={r}
                  role="radio"
                  aria-checked={row.role === r}
                  data-team={ROLE_TEAM[r]}
                  className={`role-opt ${row.role === r ? 'is-on' : ''}`}
                  onClick={() => update(i, { role: r })}
                  title={ROLE_NAMES[r]}
                >
                  {ROLE_SHORT[r]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <TimingsEditor value={timings} onChange={setTimings} />

      <div className="setup-foot">
        <button className="btn btn-primary btn-lg" disabled={errors.length > 0 || starting} onClick={start}>
          Начать игру
        </button>
        {errors.length > 0 && (
          <ul className="errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
