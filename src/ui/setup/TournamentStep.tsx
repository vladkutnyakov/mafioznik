import type { ScoringSystem } from '../../engine';
import { ScoringPicker } from './ScoringPicker';

export type GameMode = 'tournament' | 'casual';

/** Настройки турнира, которые помнятся между играми. Номер игры считается по сохранённым партиям. */
export interface TournamentDraft {
  id: string;
  name: string;
  host: string;
  games: number;
  scoring: ScoringSystem;
}

export const MIN_GAMES = 1;
export const MAX_GAMES = 30;

/** Чего не хватает, чтобы начать игру турнира. */
export function validateTournament(t: TournamentDraft): string[] {
  const errors: string[] = [];
  if (!t.name.trim()) errors.push('Укажите название турнира.');
  if (!t.host.trim()) errors.push('Укажите ник ведущего.');
  return errors;
}

export function ModeStep({ onPick }: { onPick: (mode: GameMode) => void }) {
  return (
    <div className="mode-choice">
      <button className="mode-card" onClick={() => onPick('tournament')}>
        <span className="mode-card-title">Турнирная игра</span>
        <span className="mode-card-text">Серия игр с подсчётом баллов: название турнира, ведущий, число игр.</span>
      </button>
      <button className="mode-card" onClick={() => onPick('casual')}>
        <span className="mode-card-title">Обычная игра</span>
        <span className="mode-card-text">Просто игра без счёта: в итогах только победившая команда.</span>
      </button>
    </div>
  );
}

interface TournamentStepProps {
  value: TournamentDraft;
  /** Сколько игр этого турнира уже сохранено. */
  played: number;
  onChange: (value: TournamentDraft) => void;
  /** Начать новый турнир вместо продолжения прошлого. */
  onReset: () => void;
  onNext: () => void;
}

export function TournamentStep({ value, played, onChange, onReset, onNext }: TournamentStepProps) {
  const set = (patch: Partial<TournamentDraft>) => onChange({ ...value, ...patch });
  const errors = validateTournament(value);
  const minGames = Math.max(MIN_GAMES, played + 1);

  return (
    <>
      <section className="card tournament-form">
        {played > 0 && (
          <div className="tournament-continue">
            <span className="spacer">
              Продолжаем турнир: сыграно {played} из {value.games}
            </span>
            <button className="btn btn-ghost" onClick={onReset}>
              Новый турнир
            </button>
          </div>
        )}

        <label className="field">
          <span className="field-label">Название турнира</span>
          <input
            className="text-input"
            value={value.name}
            placeholder="Например, Кубок клуба"
            autoComplete="off"
            autoCapitalize="sentences"
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="field-label">Ник ведущего</span>
          <input
            className="text-input"
            value={value.host}
            placeholder="Ник ведущего"
            list="known-nicknames"
            autoComplete="off"
            autoCapitalize="words"
            onChange={(e) => set({ host: e.target.value })}
          />
        </label>

        <div className="field">
          <div className="field-label">Игр в турнире</div>
          <div className="ctl-group">
            <button
              className="ctl"
              disabled={value.games <= minGames}
              onClick={() => set({ games: value.games - 1 })}
              aria-label="Игр: меньше"
            >
              −
            </button>
            <span className="ctl ctl-value" aria-live="polite">
              {value.games}
            </span>
            <button
              className="ctl"
              disabled={value.games >= MAX_GAMES}
              onClick={() => set({ games: value.games + 1 })}
              aria-label="Игр: больше"
            >
              +
            </button>
          </div>
        </div>

        <ScoringPicker value={value.scoring} onChange={(scoring) => set({ scoring })} />
      </section>

      <div className="tournament-actions">
        <button className="btn btn-primary btn-lg" disabled={errors.length > 0} onClick={onNext}>
          Дальше: рассадка
        </button>
        {errors.length > 0 && <span className="errors">{errors.join(' ')}</span>}
      </div>
    </>
  );
}
