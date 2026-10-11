interface Props {
  /** Максимальное доступное число. */
  max: number;
  /** Сколько кнопок показывать: обычно число живых игроков. */
  upTo: number;
  value: number | null;
  onPick: (n: number) => void;
}

export function NumberPad({ max, upTo, value, onPick }: Props) {
  return (
    <div className="numpad">
      {Array.from({ length: upTo + 1 }, (_, n) => (
        <button
          key={n}
          className={`numpad-btn ${value === n ? 'is-on' : ''}`}
          disabled={n > max}
          onClick={() => onPick(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
