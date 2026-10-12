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

const ROLES: { role: Role; label: string; max: number }[] = [
  { role: 'civilian', label: 'Мирные', max: 9 },
  { role: 'sheriff', label: 'Шериф', max: 1 },
  { role: 'mafia', label: 'Мафия', max: 5 },
  { role: 'don', label: 'Дон', max: 1 },
];

const sameComposition = (a: Composition, b: Composition) =>
  a.civilian === b.civilian && a.sheriff === b.sheriff && a.mafia === b.mafia && a.don === b.don;

/** Число игроков за столом и состав ролей. */
export function CompositionEditor({ players, composition, onPlayers, onComposition }: Props) {
  const reds = compositionReds(composition);
  const blacks = compositionBlacks(composition);
  const total = reds + blacks;
  const preset = compositionFor(players);
  const isPreset = sameComposition(composition, preset);
  const counts = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i);

  return (
    <section className="card composition">
      <div className="composition-row">
        <div className="composition-block">
          <div className="section-label">Игроков за столом</div>
          <div className="segmented">
            {counts.map((n) => (
              <button key={n} className={players === n ? 'is-on' : ''} onClick={() => onPlayers(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="composition-block composition-roles">
          <div className="section-label">Состав</div>
          <div className="composition-steppers">
            {ROLES.map(({ role, label, max }) => (
              <div key={role} className={`role-stepper ${role === 'mafia' || role === 'don' ? 'is-black' : 'is-red'}`}>
                <span className="role-stepper-label">{label}</span>
                <div className="role-stepper-control">
                  <button
                    className="btn btn-icon"
                    disabled={composition[role] <= 0}
                    onClick={() => onComposition({ ...composition, [role]: composition[role] - 1 })}
                    aria-label={`${label}: меньше`}
                  >
                    −
                  </button>
                  <span className="role-stepper-value">{composition[role]}</span>
                  <button
                    className="btn btn-icon"
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
        </div>
      </div>

      <div className="composition-summary">
        <span>
          <i className="dot dot-red" /> красных {reds}
        </span>
        <span>
          <i className="dot dot-black" /> чёрных {blacks}
        </span>
        {total === players && reds > blacks && blacks > 0 ? (
          <span className="muted">
            Мафии нужно убрать {reds - blacks} красных, городу — найти {blacks} чёрных.
          </span>
        ) : (
          <span className="composition-warn">
            {total !== players ? `Ролей ${total}, а игроков ${players}.` : 'Проверьте состав.'}
          </span>
        )}
        <span className="spacer" />
        {!isPreset && (
          <button className="btn" onClick={() => onComposition(preset)}>
            Состав по умолчанию
          </button>
        )}
      </div>
    </section>
  );
}
