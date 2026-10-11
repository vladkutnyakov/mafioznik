import { Kbd } from './PhasePanel';

const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'Ход игры',
    rows: [
      [['Enter'], 'Главное действие: дальше, подтвердить'],
      [['N'], 'Второе действие: промах, без проверки, без лучшего хода'],
      [['1–9', '0'], 'Выбрать игрока: выставление, выстрел, проверка, лучший ход. 0 — это №10'],
      [['F', 'номер'], 'Дать фол игроку'],
    ],
  },
  {
    title: 'Голосование',
    rows: [
      [['цифры'], 'Число голосов за выбранного кандидата'],
      [['Enter'], 'Следующий кандидат, на последнем — подтвердить'],
      [['↑', '↓'], 'Выбрать кандидата'],
      [['Backspace'], 'Стереть число'],
    ],
  },
  {
    title: 'Таймер',
    rows: [
      [['Пробел'], 'Старт и пауза'],
      [['R'], 'Сброс'],
      [['+'], 'Добавить 10 секунд'],
    ],
  },
  {
    title: 'Прочее',
    rows: [
      [['Ctrl+Z'], 'Отменить действие'],
      [['Ctrl+Y'], 'Вернуть отменённое'],
      [['H'], 'Скрыть или показать роли'],
      [['Esc'], 'Закрыть окно, отменить ввод'],
      [['?'], 'Эта справка'],
    ],
  },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sheet-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Горячие клавиши">
        <div className="sheet-head">
          <div className="sheet-who">
            <div className="sheet-title">Горячие клавиши</div>
            <div className="muted">Работают в любой раскладке</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div className="shortcuts">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="section-label">{g.title}</div>
              {g.rows.map(([keys, text]) => (
                <div key={text} className="shortcut-row">
                  <span className="shortcut-keys">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
