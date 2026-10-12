import { useState } from 'react';
import { FIIM_REGULATION, validateTimings, type Timings } from '../../engine';
import { TimingFields, timingsChanged } from '../setup/TimingsEditor';

interface Props {
  current: Timings;
  onApply: (timings: Timings) => void;
  onClose: () => void;
}

/** Изменение таймингов посреди игры. */
export function TimingsSheet({ current, onApply, onClose }: Props) {
  const [value, setValue] = useState<Timings>({ ...current });
  const errors = validateTimings(value);
  const dirty = (Object.keys(current) as (keyof Timings)[]).some((k) => current[k] !== value[k]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sheet-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Тайминги">
        <div className="sheet-head">
          <div className="sheet-who">
            <div className="sheet-title">Тайминги</div>
            <div className="muted">
              Новые значения действуют сразу. Если поменять длительность текущей фазы, её таймер начнётся заново.
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="timings-body timings-body-sheet">
          <TimingFields value={value} onChange={setValue} />
        </div>

        {errors.length > 0 && (
          <ul className="errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="row wrap">
          <button className="btn btn-primary btn-lg" disabled={!dirty || errors.length > 0} onClick={() => onApply(value)}>
            Применить
          </button>
          <button
            className="btn"
            disabled={timingsChanged(value) === 0}
            onClick={() => setValue({ ...FIIM_REGULATION.timings })}
          >
            Как в ФИИМ
          </button>
        </div>
      </div>
    </div>
  );
}
