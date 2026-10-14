import { useState } from 'react';
import { SCORING_SYSTEMS, type ScoringSystem } from '../../engine';

interface Props {
  value: ScoringSystem;
  onChange: (value: ScoringSystem) => void;
}

/** Без баллов играют только обычные игры, в турнире выбирают одну из систем подсчёта. */
const TOURNAMENT_SYSTEMS = SCORING_SYSTEMS.filter((x) => x.id !== 'none');

/** Выбор системы баллов турнира. Подсказка к выбранной — под кнопками: на планшете нет наведения. */
export function ScoringPicker({ value, onChange }: Props) {
  const current = TOURNAMENT_SYSTEMS.find((x) => x.id === value);
  return (
    <div className="field">
      <div className="field-label">Подсчёт баллов</div>
      <div className="ctl-group" role="radiogroup" aria-label="Система баллов">
        {TOURNAMENT_SYSTEMS.map((x) => (
          <button
            key={x.id}
            role="radio"
            aria-checked={value === x.id}
            className={`ctl ctl-text ${value === x.id ? 'is-on' : ''}`}
            onClick={() => onChange(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
      {current && <ScoringRules system={current.id} hint={current.hint} />}
    </div>
  );
}

/** Краткая подсказка к системе баллов; полные правила раскрываются по кнопке «?». */
export function ScoringRules({ system, hint }: { system: ScoringSystem; hint?: string }) {
  const [open, setOpen] = useState(false);
  const rules = SCORING_SYSTEMS.find((x) => x.id === system)?.rules;
  if (!hint && !rules) return null;
  return (
    <div className="scoring-rules">
      <div className="field-hint scoring-rules-head">
        {hint}
        {rules && (
          <button
            className={`scoring-rules-toggle ${open ? 'is-on' : ''}`}
            aria-expanded={open}
            aria-label="Правила подсчёта баллов"
            title="Правила подсчёта баллов"
            onClick={() => setOpen((x) => !x)}
          >
            ?
          </button>
        )}
      </div>
      {rules && open && (
        <ol className="scoring-rules-list">
          {rules.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
