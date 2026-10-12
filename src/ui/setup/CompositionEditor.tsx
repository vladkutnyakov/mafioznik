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
  /** Сколько ролей уже раздано в рассадке. */
  assigned: Composition;
  /** Сколько мест с указанным ником. */
  filled: number;
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

/** Число игроков, состав ролей и сколько уже роздано — в одной строке подписей. */
export function CompositionEditor({ players, composition, assigned, filled, onPlayers, onComposition }: Props) {
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
          <div className="field-label">
            Игроков
            <span className={`field-count ${filled === players ? 'is-ok' : ''}`} title="Сколько мест с ником">
              ники {filled}/{players}
            </span>
          </div>
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

        {ROLES.map(({ role, label, max, team }) => {
          const need = composition[role];
          const have = assigned[role];
          const state = need === 0 && have === 0 ? 'is-off' : have === need ? 'is-ok' : 'is-bad';
          return (
            <div key={role} className="field">
              <div className="field-label">
                <i className={`dot ${team === 'red' ? 'dot-red' : 'dot-black'}`} />
                {label}
                <span className={`field-count ${state}`} title="Роздано в рассадке из нужных по составу">
                  {have}/{need}
                </span>
              </div>
              <div className="ctl-group">
                <button
                  className="ctl"
                  disabled={need <= 0}
                  onClick={() => onComposition({ ...composition, [role]: need - 1 })}
                  aria-label={`${label}: меньше`}
                >
                  −
                </button>
                <span className="ctl ctl-value" aria-live="polite">
                  {need}
                </span>
                <button
                  className="ctl"
                  disabled={need >= max}
                  onClick={() => onComposition({ ...composition, [role]: need + 1 })}
                  aria-label={`${label}: больше`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="composition-summary">
        <span className={`composition-message ${valid ? '' : 'is-warn'}`} title={message}>
          {message}
        </span>
        <button
          className="btn composition-reset"
          style={{ visibility: isPreset ? 'hidden' : 'visible' }}
          tabIndex={isPreset ? -1 : 0}
          onClick={() => onComposition(preset)}
        >
          По умолчанию
        </button>
      </div>
    </section>
  );
}
