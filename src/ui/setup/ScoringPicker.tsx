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
      {current && <div className="field-hint">{current.hint}</div>}
    </div>
  );
}
