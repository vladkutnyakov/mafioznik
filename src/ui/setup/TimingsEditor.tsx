import { useState } from 'react';
import { FIIM_REGULATION, TIMING_FIELDS, type TimingField, type Timings } from '../../engine';

interface Props {
  value: Timings;
  onChange: (value: Timings) => void;
}

const GROUPS: { key: TimingField['group']; title: string }[] = [
  { key: 'day', title: 'День' },
  { key: 'night', title: 'Ночь' },
  { key: 'signal', title: 'Сигнал' },
];

const DEFAULTS = FIIM_REGULATION.timings;

function TimingInput({ field, value, onChange }: { field: TimingField; value: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(field.max, Math.max(field.min, v));
  const invalid = !Number.isInteger(value) || value < field.min || value > field.max;
  const isDefault = value === DEFAULTS[field.key];
  return (
    <div className={`timing ${invalid ? 'is-invalid' : ''}`}>
      <div className="timing-label">
        <span>{field.label}</span>
        {field.hint && <span className="timing-hint">{field.hint}</span>}
      </div>
      <div className="timing-control">
        <button
          className="btn btn-icon"
          onClick={() => onChange(clamp((Number.isFinite(value) ? value : field.min) - field.step))}
          disabled={value <= field.min}
          aria-label={`${field.label}: меньше`}
        >
          −
        </button>
        <input
          className="timing-input"
          type="number"
          inputMode="numeric"
          min={field.min}
          max={field.max}
          step={1}
          value={Number.isNaN(value) ? '' : value}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Math.round(Number(e.target.value)))}
          aria-label={field.label}
        />
        <span className="timing-unit">с</span>
        <button
          className="btn btn-icon"
          onClick={() => onChange(clamp((Number.isFinite(value) ? value : field.min) + field.step))}
          disabled={value >= field.max}
          aria-label={`${field.label}: больше`}
        >
          +
        </button>
      </div>
      {!isDefault && !invalid && <span className="timing-default">в ФИИМ: {DEFAULTS[field.key]} с</span>}
    </div>
  );
}

/** Поля таймингов по группам «День», «Ночь», «Сигнал». */
export function TimingFields({ value, onChange }: Props) {
  return (
    <>
      {GROUPS.map((g) => (
        <div key={g.key} className="timings-group">
          <div className="section-label">{g.title}</div>
          {TIMING_FIELDS.filter((f) => f.group === g.key).map((f) => (
            <TimingInput key={f.key} field={f} value={value[f.key]} onChange={(v) => onChange({ ...value, [f.key]: v })} />
          ))}
        </div>
      ))}
    </>
  );
}

export const timingsChanged = (value: Timings) => TIMING_FIELDS.filter((f) => value[f.key] !== DEFAULTS[f.key]).length;

/** Настройки таймингов на экране новой игры. Свёрнуты в одну строку, пока их не открыли. */
export function TimingsEditor({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const changed = timingsChanged(value);
  const s = (v: number) => (Number.isFinite(v) ? `${v} с` : '—');

  return (
    <section className="card timings">
      <button className="timings-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="timings-title">
          <b>Тайминги</b>
          <span className={changed ? 'timings-badge is-changed' : 'timings-badge'}>
            {changed ? `изменено: ${changed}` : 'как в ФИИМ'}
          </span>
        </span>
        <span className="timings-summary">
          речь {s(value.speech)} · оправдание {s(value.tieSpeech)} · прощальная {s(value.farewell)} · договорка{' '}
          {s(value.mafiaMeet)}
        </span>
        <span className="timings-toggle">{open ? 'Свернуть' : 'Изменить'}</span>
      </button>

      {open && (
        <div className="timings-body">
          <TimingFields value={value} onChange={onChange} />
          <div className="timings-actions">
            <button className="btn" disabled={changed === 0} onClick={() => onChange({ ...DEFAULTS })}>
              Вернуть как в ФИИМ
            </button>
            <span className="muted">Настройки запомнятся для следующих игр.</span>
          </div>
        </div>
      )}
    </section>
  );
}
