import { useEffect, useMemo, useState } from 'react';
import {
  FIIM_REGULATION,
  MAX_SEATS,
  MIN_SEATS,
  ROLE_NAMES,
  ROLE_TEAM,
  SEAT_COUNT,
  compositionFor,
  validateComposition,
  validateSetup,
  type Composition,
  type GameSetup,
  type Role,
  type Timings,
} from '../../engine';
import { KEYS, kvGet, kvSet } from '../../storage/db';
import { CompositionEditor } from '../setup/CompositionEditor';
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

const emptyRows = (n: number): Row[] => Array.from({ length: n }, () => ({ nickname: '', role: 'civilian' }));

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function randomRoles(composition: Composition): Role[] {
  const pool = ROLE_ORDER.flatMap((r) => Array<Role>(composition[r]).fill(r));
  return shuffle(pool);
}

export function SetupScreen({ onBack, onStart }: Props) {
  const [rows, setRows] = useState<Row[]>(() => emptyRows(SEAT_COUNT));
  const [composition, setComposition] = useState<Composition>(() => compositionFor(SEAT_COUNT));
  const [known, setKnown] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [timings, setTimings] = useState<Timings>({ ...FIIM_REGULATION.timings });
  const players = rows.length;

  // Подставляем стол прошлой игры: за вечер обычно играют одни и те же люди и тем же составом.
  useEffect(() => {
    void Promise.all([
      kvGet<string[]>(KEYS.lastLineup),
      kvGet<string[]>(KEYS.knownNicknames),
      kvGet<Composition>(KEYS.lastComposition),
      kvGet<Partial<Timings>>(KEYS.lastTimings),
    ]).then(([lineup, names, savedComposition, savedTimings]) => {
      if (lineup && lineup.length >= MIN_SEATS && lineup.length <= MAX_SEATS) {
        setRows(lineup.map((nickname) => ({ nickname, role: 'civilian' })));
        const fits = savedComposition && validateComposition(savedComposition, lineup.length).length === 0;
        setComposition(fits ? savedComposition : compositionFor(lineup.length));
      }
      setKnown(names ?? []);
      if (savedTimings) setTimings({ ...FIIM_REGULATION.timings, ...savedTimings });
    });
  }, []);

  /** Меняет число мест: ники сохраняются, роли сбрасываются, состав — по умолчанию для этого стола. */
  const changePlayers = (n: number) => {
    if (n === players) return;
    setRows((prev) => Array.from({ length: n }, (_, i) => ({ nickname: prev[i]?.nickname ?? '', role: 'civilian' })));
    setComposition(compositionFor(n));
  };

  const setup: GameSetup = useMemo(
    () => ({
      regulation: { ...FIIM_REGULATION, timings },
      composition,
      seats: rows.map((r) => ({ player: { nickname: r.nickname.trim() }, role: r.role })),
    }),
    [rows, timings, composition],
  );

  const errors = useMemo(() => {
    const list = validateSetup(setup);
    const names = rows.map((r) => r.nickname.trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) list.push('Есть повторяющиеся ники.');
    return list;
  }, [setup, rows]);

  const compositionValid = validateComposition(composition, players).length === 0;

  // Незаполненные места склеиваем в одну строку, чтобы список ошибок не рос с каждым местом.
  const shownErrors = useMemo(() => {
    const empty: string[] = [];
    const rest: string[] = [];
    for (const e of errors) {
      const m = /^Место №(\d+): не указан игрок\.$/.exec(e);
      if (m) empty.push(m[1]!);
      else rest.push(e);
    }
    if (empty.length) rest.push(empty.length === 1 ? `Не указан игрок на месте №${empty[0]}.` : `Не указаны игроки на местах ${empty.join(', ')}.`);
    return rest;
  }, [errors]);

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
      kvSet(KEYS.lastComposition, composition),
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

      <CompositionEditor
        players={players}
        composition={composition}
        onPlayers={changePlayers}
        onComposition={setComposition}
      />

      <div className="row wrap" style={{ margin: '16px 0' }}>
        <div className="counters">
          {ROLE_ORDER.map((r) => (
            <span
              key={r}
              className={`counter ${composition[r] === 0 && counts[r] === 0 ? 'is-off' : counts[r] === composition[r] ? 'is-ok' : 'is-bad'}`}
            >
              {ROLE_NAMES[r]}: {counts[r]}/{composition[r]}
            </span>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setRows((prev) => prev.map((r) => ({ ...r, role: 'civilian' })))}>
          Сбросить роли
        </button>
        <button
          className="btn"
          disabled={!compositionValid}
          onClick={() => {
            const roles = randomRoles(composition);
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
        <button className="btn btn-ghost" onClick={() => setRows(emptyRows(players))}>
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
                  disabled={composition[r] === 0 && row.role !== r}
                  title={composition[r] === 0 ? `${ROLE_NAMES[r]}: нет в составе` : ROLE_NAMES[r]}
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
            {shownErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
