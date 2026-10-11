import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  confirmLabel?: ReactNode;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}

/** Кнопка опасного действия: первое нажатие взводит, второе выполняет. Сама разряжается через 4 секунды. */
export function ConfirmButton({ children, confirmLabel, onConfirm, className = 'btn btn-danger', disabled }: Props) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);

  return (
    <button
      className={`${className} ${armed ? 'is-armed' : ''}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? (confirmLabel ?? 'Нажмите ещё раз') : children}
    </button>
  );
}
