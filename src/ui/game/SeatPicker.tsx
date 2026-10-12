import type { GameState } from '../../engine';
import type { PickerSpec } from './phaseUi';

/** Сетка номеров мест для выбора игрока прямо на панели. Ники видны на столе. */
export function SeatPicker({ state, spec }: { state: GameState; spec: PickerSpec }) {
  return (
    <div className="picker">
      <div className="section-label">{spec.label}</div>
      <div className="picker-grid">
        {state.seats.map((s) => {
          const on = spec.selected.includes(s.seat);
          const can = on || spec.can(s.seat);
          return (
            <button
              key={s.seat}
              className={`pick ${on ? 'is-on' : ''}`}
              disabled={!can}
              onClick={() => spec.onPick(s.seat)}
              aria-pressed={on}
              aria-label={`№${s.seat}, ${s.player.nickname}`}
              title={s.player.nickname}
            >
              {s.seat}
            </button>
          );
        })}
      </div>
    </div>
  );
}
