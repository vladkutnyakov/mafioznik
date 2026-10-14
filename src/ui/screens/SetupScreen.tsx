import { useEffect, useMemo, useState } from 'react';
import {
  FIIM_REGULATION,
  MAX_SEATS,
  MIN_SEATS,
  SCORING_SYSTEMS,
  SEAT_COUNT,
  compositionFor,
  validateComposition,
  validateSetup,
  withScoring,
  type Composition,
  type GameSetup,
  type ScoringSystem,
  type Timings,
} from '../../engine';
import { KEYS, kvGet, kvSet } from '../../storage/db';
import { CompositionEditor } from '../setup/CompositionEditor';
import { ScoringPicker } from '../setup/ScoringPicker';
import { TimingsBar } from '../setup/TimingsEditor';

interface Props {
  onBack: () => void;
  onStart: (setup: GameSetup) => void | Promise<void>;
}

// Ролей в рассадке нет: игроки узнают их в Ночь 0, тогда же ведущий их и отмечает.
interface Row {
  nickname: string;
}

const emptyRows = (n: number): Row[] => Array.from({ length: n }, () => ({ nickname: '' }));

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function SetupScreen({ onBack, onStart }: Props) {
  const [rows, setRows] = useState<Row[]>(() => emptyRows(SEAT_COUNT));
  const [composition, setComposition] = useState<Composition>(() => compositionFor(SEAT_COUNT));
  const [known, setKnown] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [timings, setTimings] = useState<Timings>({ ...FIIM_REGULATION.timings });
  const [scoring, setScoring] = useState<ScoringSystem>('fiim');
  const players = rows.length;

  // Подставляем стол прошлой игры: за вечер обычно играют одни и те же люди и тем же составом.
  useEffect(() => {
    void Promise.all([
      kvGet<string[]>(KEYS.lastLineup),
      kvGet<string[]>(KEYS.knownNicknames),
      kvGet<Composition>(KEYS.lastComposition),
      kvGet<Partial<Timings>>(KEYS.lastTimings),
      kvGet<ScoringSystem>(KEYS.lastScoring),
    ]).then(([lineup, names, savedComposition, savedTimings, savedScoring]) => {
      if (lineup && lineup.length >= MIN_SEATS && lineup.length <= MAX_SEATS) {
        setRows(lineup.map((nickname) => ({ nickname })));
        const fits = savedComposition && validateComposition(savedComposition, lineup.length).length === 0;
        setComposition(fits ? savedComposition : compositionFor(lineup.length));
      }
      setKnown(names ?? []);
      if (savedTimings) setTimings({ ...FIIM_REGULATION.timings, ...savedTimings });
      if (SCORING_SYSTEMS.some((x) => x.id === savedScoring)) setScoring(savedScoring!);
    });
  }, []);

  /** Меняет число мест: ники сохраняются, состав — по умолчанию для этого стола. */
  const changePlayers = (n: number) => {
    if (n === players) return;
    setRows((prev) => Array.from({ length: n }, (_, i) => ({ nickname: prev[i]?.nickname ?? '' })));
    setComposition(compositionFor(n));
  };

  const setup: GameSetup = useMemo(
    () => ({
      regulation: withScoring({ ...FIIM_REGULATION, timings }, scoring),
      composition,
      seats: rows.map((r) => ({ player: { nickname: r.nickname.trim() } })),
    }),
    [rows, timings, composition, scoring],
  );

  const errors = useMemo(() => {
    const list = validateSetup(setup);
    const names = rows.map((r) => r.nickname.trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) list.push('Есть повторяющиеся ники.');
    return list;
  }, [setup, rows]);

  // Незаполненные места склеиваем в одну строку, чтобы список ошибок не рос с каждым местом.
  const shownErrors = useMemo(() => {
    const empty: string[] = [];
    const rest: string[] = [];
    for (const e of errors) {
      const seat = /^Место №(\d+): не указан игрок\.$/.exec(e);
      if (seat) empty.push(seat[1]!);
      else rest.push(e);
    }
    if (empty.length) {
      rest.push(empty.length === 1 ? `Не указан игрок на месте №${empty[0]}.` : `Не указаны игроки на местах ${empty.join(', ')}.`);
    }
    return rest;
  }, [errors]);

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
      kvSet(KEYS.lastScoring, scoring),
    ]);
    await onStart(setup);
  };

  return (
    <div className="screen setup">
      {/* Действия с рассадкой — в шапке: отдельная строка под них съедала высоту. */}
      <div className="setup-head">
        <button className="icon-btn" onClick={onBack} aria-label="Назад">
          ←
        </button>
        <h1 className="setup-title">Новая игра</h1>
        <div className="spacer" />
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

      <CompositionEditor
        players={players}
        composition={composition}
        filled={rows.filter((r) => r.nickname.trim()).length}
        onPlayers={changePlayers}
        onComposition={setComposition}
      />

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
          </div>
        ))}
      </div>

      <div className="setup-foot">
        <button className="btn btn-primary btn-lg" disabled={errors.length > 0 || starting} onClick={start}>
          Начать игру
        </button>
        <ScoringPicker value={scoring} onChange={setScoring} />
        <TimingsBar value={timings} onChange={setTimings} />
      </div>
      {errors.length > 0 && (
        <ul className="errors setup-errors">
          {shownErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
