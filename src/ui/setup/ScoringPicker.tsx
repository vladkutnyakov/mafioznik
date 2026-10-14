import { SCORING_SYSTEMS, type ScoringSystem } from '../../engine';

interface Props {
  value: ScoringSystem;
  onChange: (value: ScoringSystem) => void;
}

/** Выбор системы баллов перед игрой. Подсказка к каждой — во всплывающей подсказке кнопки. */
export function ScoringPicker({ value, onChange }: Props) {
  return (
    <div className="scoring-picker">
      <span className="scoring-label">Баллы</span>
      <div className="ctl-group" role="radiogroup" aria-label="Система баллов">
        {SCORING_SYSTEMS.map((x) => (
          <button
            key={x.id}
            role="radio"
            aria-checked={value === x.id}
            title={x.hint}
            className={`ctl ctl-text ${value === x.id ? 'is-on' : ''}`}
            onClick={() => onChange(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}
