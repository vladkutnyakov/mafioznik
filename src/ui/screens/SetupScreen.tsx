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
  type TournamentInfo,
  type Composition,
  type GameSetup,
  type ScoringSystem,
  type Timings,
} from '../../engine';
import { makeId } from '../../session/session';
import { getArchive } from '../../storage/archive';
import { emptyArchive, gamesInTournament, knownNicknames, type Archive } from '../../storage/archive-model';
import { KEYS, kvGet, kvSet } from '../../storage/db';
import { CompositionEditor } from '../setup/CompositionEditor';
import { TimingsBar } from '../setup/TimingsEditor';
import { ModeStep, TournamentStep, type GameMode, type TournamentDraft } from '../setup/TournamentStep';

interface Props {
  onBack: () => void;
  onStart: (setup: GameSetup) => void | Promise<void>;
}

// Ролей в рассадке нет: игроки узнают их в Ночь 0, тогда же ведущий их и отмечает.
interface Row {
  nickname: string;
}

/** Шаги новой игры: режим, для турнира — его настройки, затем рассадка. */
type Step = 'mode' | 'tournament' | 'seats';

/** Новый турнир: ведущий, число игр и система баллов — как в прошлом. */
const newTournament = (prev?: Partial<TournamentDraft>): TournamentDraft => ({
  id: makeId(),
  name: '',
  host: prev?.host ?? '',
  games: prev?.games ?? 10,
  scoring: prev?.scoring ?? 'fiim',
});

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
  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<GameMode>('casual');
  const [tournament, setTournament] = useState<TournamentDraft>(() => newTournament());
  const [archive, setArchive] = useState<Archive>(emptyArchive);
  const players = rows.length;
  const scoring: ScoringSystem = mode === 'tournament' ? tournament.scoring : 'none';
  /** Сколько игр турнира уже сохранено: следующая получает номер на единицу больше. */
  const played = useMemo(() => gamesInTournament(archive, tournament.id), [archive, tournament.id]);

  // Подставляем стол прошлой игры: за вечер обычно играют одни и те же люди и тем же составом.
  useEffect(() => {
    void Promise.all([
      kvGet<string[]>(KEYS.lastLineup),
      kvGet<Composition>(KEYS.lastComposition),
      kvGet<Partial<Timings>>(KEYS.lastTimings),
      kvGet<ScoringSystem>(KEYS.lastScoring),
      kvGet<TournamentDraft>(KEYS.lastTournament),
      getArchive(),
    ]).then(([lineup, savedComposition, savedTimings, savedScoring, savedTournament, saved]) => {
      if (lineup && lineup.length >= MIN_SEATS && lineup.length <= MAX_SEATS) {
        setRows(lineup.map((nickname) => ({ nickname })));
        const fits = savedComposition && validateComposition(savedComposition, lineup.length).length === 0;
        setComposition(fits ? savedComposition : compositionFor(lineup.length));
      }
      setKnown(knownNicknames(saved));
      if (savedTimings) setTimings({ ...FIIM_REGULATION.timings, ...savedTimings });
      setArchive(saved);
      // Прошлый турнир продолжаем, пока в нём остались игры; иначе — новый с тем же ведущим.
      const scoringOk = (x?: ScoringSystem) => x !== 'none' && SCORING_SYSTEMS.some((s) => s.id === x);
      if (savedTournament && scoringOk(savedTournament.scoring)) {
        const unfinished = gamesInTournament(saved, savedTournament.id) < savedTournament.games;
        setTournament(unfinished ? savedTournament : newTournament(savedTournament));
      } else if (scoringOk(savedScoring)) {
        setTournament(newTournament({ scoring: savedScoring }));
      }
    });
  }, []);

  /** Меняет число мест: ники сохраняются, состав — по умолчанию для этого стола. */
  const changePlayers = (n: number) => {
    if (n === players) return;
    setRows((prev) => Array.from({ length: n }, (_, i) => ({ nickname: prev[i]?.nickname ?? '' })));
    setComposition(compositionFor(n));
  };

  const tournamentInfo: TournamentInfo | undefined = useMemo(
    () =>
      mode === 'tournament'
        ? {
            id: tournament.id,
            name: tournament.name.trim(),
            host: tournament.host.trim(),
            games: tournament.games,
            game: played + 1,
          }
        : undefined,
    [mode, tournament, played],
  );

  const setup: GameSetup = useMemo(
    () => ({
      regulation: withScoring({ ...FIIM_REGULATION, timings }, scoring),
      composition,
      seats: rows.map((r) => ({ player: { nickname: r.nickname.trim() } })),
      ...(tournamentInfo && { tournament: tournamentInfo }),
    }),
    [rows, timings, composition, scoring, tournamentInfo],
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
    await Promise.all([
      kvSet(KEYS.lastLineup, nicknames),
      kvSet(KEYS.lastTimings, timings),
      kvSet(KEYS.lastComposition, composition),
      ...(tournamentInfo
        ? [
            kvSet(KEYS.lastScoring, scoring),
            kvSet(KEYS.lastTournament, { ...tournament, name: tournamentInfo.name, host: tournamentInfo.host }),
          ]
        : []),
    ]);
    await onStart(setup);
  };

  const datalist = (
    <datalist id="known-nicknames">
      {known.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );

  if (step !== 'seats') {
    return (
      <div className="screen setup">
        <div className="setup-step">
          <div className="setup-head">
            <button className="icon-btn" onClick={step === 'mode' ? onBack : () => setStep('mode')} aria-label="Назад">
              ←
            </button>
            <h1 className="setup-title">{step === 'mode' ? 'Новая игра' : 'Турнир'}</h1>
          </div>
          {datalist}
          {step === 'mode' ? (
            <ModeStep
              onPick={(m) => {
                setMode(m);
                setStep(m === 'tournament' ? 'tournament' : 'seats');
              }}
            />
          ) : (
            <TournamentStep
              value={tournament}
              played={played}
              onChange={setTournament}
              onReset={() => setTournament(newTournament(tournament))}
              onNext={() => setStep('seats')}
            />
          )}
        </div>
      </div>
    );
  }

  const subtitle = tournamentInfo
    ? `${tournamentInfo.name} · игра ${tournamentInfo.game} из ${tournamentInfo.games} · ведущий ${tournamentInfo.host}`
    : 'Обычная игра · без счёта';

  return (
    <div className="screen setup">
      {/* Действия с рассадкой — в шапке: отдельная строка под них съедала высоту. */}
      <div className="setup-head">
        <button
          className="icon-btn"
          onClick={() => setStep(mode === 'tournament' ? 'tournament' : 'mode')}
          aria-label="Назад"
        >
          ←
        </button>
        <div className="setup-titles">
          <h1 className="setup-title">Рассадка</h1>
          <div className="setup-subtitle" title={subtitle}>
            {subtitle}
          </div>
        </div>
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

      {datalist}

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
