import {
  MAX_SEATS,
  MIN_SEATS,
  compositionBlacks,
  compositionFor,
  compositionReds,
  type Composition,
  type Role,
} from '../../engine';

interface Props {
  players: number;
  composition: Composition;
  onPlayers: (n: number) => void;
  onComposition: (c: Composition) => void;
}

const ROLES: { role: Role; label: string; max: number; team: 'red' | 'black' }[] = [
  { role: 'civilian', label: 'Мирные', max: 9, team: 'red' },
  { role: 'sheriff', label: 'Шериф', max: 1, team: 'red' },
  { role: 'mafia', label: 'Мафия', max: 5, team: 'black' },
  { role: 'don', label: 'Дон', max: 1, team: 'black' },
];

/** «1 красного», «2 красных», «21 красного». */
const gen = (n: number, one: string, many: string) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : many}`;

const sameComposition = (a: Composition, b: Composition) =>
  a.civilian === b.civilian && a.sheriff === b.sheriff && a.mafia === b.mafia && a.don === b.don;

/** Число игроков за столом и состав ролей. Все контролы одной высоты, подписи на одной линии. */
export function CompositionEditor({ players, composition, onPlayers, onComposition }: Props) {
  const reds = compositionReds(composition);
  const blacks = compositionBlacks(composition);
  const total = reds + blacks;
  const preset = compositionFor(players);
  const isPreset = sameComposition(composition, preset);
  const counts = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i);
  const valid = total === players && reds > blacks && blacks > 0;

  let message: string;
  if (total !== players) message = `Ролей ${total}, а игроков ${players}. Поправьте состав.`;
  else if (blacks === 0) message = 'Нужен хотя бы один чёрный игрок.';
  else if (reds <= blacks) message = 'Красных должно быть больше, чем чёрных.';
  else message = `Мафии нужно убрать ${gen(reds - blacks, 'красного', 'красных')}, городу — найти ${gen(blacks, 'чёрного', 'чёрных')}.`;

  return (
    <section className="card composition">
      <div className="composition-fields">
        <div className="field">
          <div className="field-label">Игроков</div>
          <div className="ctl-group" role="radiogroup" aria-label="Игроков за столом">
            {counts.map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={players === n}
                className={`ctl ${players === n ? 'is-on' : ''}`}
                onClick={() => onPlayers(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {ROLES.map(({ role, label, max, team }) => (
          <div key={role} className="field">
            <div className="field-label">
              <i className={`dot ${team === 'red' ? 'dot-red' : 'dot-black'}`} />
              {label}
            </div>
            <div className="ctl-group">
              <button
                className="ctl"
                disabled={composition[role] <= 0}
                onClick={() => onComposition({ ...composition, [role]: composition[role] - 1 })}
                aria-label={`${label}: меньше`}
              >
                −
              </button>
              <span className="ctl ctl-value" aria-live="polite">
                {composition[role]}
              </span>
              <button
                className="ctl"
                disabled={composition[role] >= max}
                onClick={() => onComposition({ ...composition, [role]: composition[role] + 1 })}
                aria-label={`${label}: больше`}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="composition-summary">
        <span className="composition-teams">
          <span>
            <i className="dot dot-red" />
            красных {reds}
          </span>
          <span>
            <i className="dot dot-black" />
            чёрных {blacks}
          </span>
        </span>
        <span className={`composition-message ${valid ? '' : 'is-warn'}`} title={message}>
          {message}
        </span>
        <button
          className="btn composition-reset"
          style={{ visibility: isPreset ? 'hidden' : 'visible' }}
          tabIndex={isPreset ? -1 : 0}
          onClick={() => onComposition(preset)}
        >
          Состав по умолчанию
        </button>
      </div>
    </section>
  );
}
