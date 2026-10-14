import {
  FINISH_REASON_NAMES,
  ROLE_NAMES,
  ROLE_TEAM,
  SCORING_SYSTEMS,
  TEAM_NAMES,
  computeScores,
  extraRules,
  freeExtra,
  scoringSystem,
  seatOf,
  type ExtraRules,
  type GameEvent,
  type GameState,
  type Role,
} from '../../engine';

interface Props {
  state: GameState;
  dispatch: (event: GameEvent) => boolean;
  onSave: () => void;
  onShowTable: () => void;
}

const fmt = (x: number) => (x === 0 ? '0' : x.toFixed(2).replace(/\.?0+$/, '').replace('.', ','));
const signed = (x: number) => (x > 0 ? `+${fmt(x)}` : fmt(x));
const list = (seats: number[]) => seats.map((n) => `№${n}`).join(', ');

/** Когда и как игрок покинул стол. Пусто — дожил до конца игры. */
function exitLabel(state: GameState, seat: number): string {
  const e = state.eliminations.find((x) => x.seat === seat);
  if (!e) return '—';
  if (e.kind === 'killed') return `убит в ночь ${e.day}`;
  if (e.kind === 'voted') return `поднят в день ${e.day}`;
  return 'удалён со стола';
}

/** Фолы и выбывание: общие колонки обеих таблиц итогов. */
function SeatFacts({ state, seat }: { state: GameState; seat: number }) {
  return (
    <>
      <td>{seatOf(state, seat).fouls || '—'}</td>
      <td className="exit">{exitLabel(state, seat)}</td>
    </>
  );
}

export function ResultsView({ state, dispatch, onSave, onShowTable }: Props) {
  const result = state.result!;
  const rules = extraRules(state);
  const free = freeExtra(state);
  const system = SCORING_SYSTEMS.find((x) => x.id === scoringSystem(state.regulation))!;

  return (
    <div className="results">
      <div className="results-head" data-team={result.winner}>
        <div>
          <div className="results-winner">Победа: {TEAM_NAMES[result.winner]}</div>
          <div className="muted">
            {FINISH_REASON_NAMES[result.reason]} · баллы: {system.label.toLowerCase()}
          </div>
          {free > 0 && <div className="results-free">Забрано и не отдано доп. баллов: {free}</div>}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={onShowTable}>
          Показать стол
        </button>
        <button className="btn btn-primary btn-lg" onClick={onSave}>
          Сохранить игру
        </button>
      </div>

      {/* Таблица баллов и ход игры рядом: таблица всегда на виду, длинный ход игры прокручивается в своей колонке. */}
      <div className="results-body">
        {rules ? <ScoreTable state={state} rules={rules} free={free} dispatch={dispatch} /> : <RolesTable state={state} />}
        <GameLog state={state} />
      </div>
    </div>
  );
}

function RoleCell({ role }: { role: Role }) {
  const red = ROLE_TEAM[role] === 'red';
  return (
    <span className={`seat-role ${red ? 'is-red' : 'is-black'}`}>
      <i className={`dot ${red ? 'dot-red' : 'dot-black'}`} />
      {ROLE_NAMES[role]}
    </span>
  );
}

interface ScoreTableProps {
  state: GameState;
  rules: ExtraRules;
  free: number;
  dispatch: (event: GameEvent) => boolean;
}

function ScoreTable({ state, rules, free, dispatch }: ScoreTableProps) {
  const scores = computeScores(state) ?? [];
  // Упрощённые доп. баллы целые и не бывают отрицательными, знак им не нужен.
  const shown = rules.total === null ? signed : fmt;

  const setExtra = (seat: number, value: number) => {
    const clamped = Math.min(rules.max, Math.max(rules.min, Math.round(value * 100) / 100));
    dispatch({ type: 'setExtraPoints', seat, value: clamped });
  };

  return (
    <table className="score-table">
      <thead>
        <tr>
          <th>№</th>
          <th>Игрок</th>
          <th>Роль</th>
          <th>Фолы</th>
          <th>Выбыл</th>
          <th>Победа</th>
          <th>ЛХ</th>
          <th>Штраф</th>
          <th>Доп. баллы</th>
          <th>Итог</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((s) => (
          <tr key={s.seat} data-team={s.team} className={s.won ? 'is-won' : ''}>
            <td className="num">{s.seat}</td>
            <td className="nick" title={s.player.nickname}>
              {s.player.nickname}
            </td>
            <td>
              <RoleCell role={s.role} />
            </td>
            <SeatFacts state={state} seat={s.seat} />
            <td>{fmt(s.base)}</td>
            <td>{s.bestMove ? signed(s.bestMove) : '—'}</td>
            <td className={s.penalty ? 'penalty' : ''}>{s.penalty ? `−${fmt(s.penalty)}` : '—'}</td>
            <td>
              <div className="stepper">
                <button
                  className="icon-btn"
                  disabled={s.extra <= rules.min}
                  onClick={() => setExtra(s.seat, s.extra - rules.step)}
                  aria-label="Меньше"
                >
                  −
                </button>
                <span className="stepper-value">{shown(s.extra)}</span>
                <button
                  className="icon-btn"
                  // Когда сумма баллов постоянна, прибавить можно только забранный у кого-то балл.
                  disabled={s.extra >= rules.max || (rules.total !== null && free <= 0)}
                  onClick={() => setExtra(s.seat, s.extra + rules.step)}
                  aria-label="Больше"
                >
                  +
                </button>
              </div>
            </td>
            <td className="total">{fmt(s.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Игра без баллов: роли, фолы и выбывание. */
function RolesTable({ state }: { state: GameState }) {
  const winner = state.result?.winner;
  return (
    <table className="score-table">
      <thead>
        <tr>
          <th>№</th>
          <th>Игрок</th>
          <th>Роль</th>
          <th>Фолы</th>
          <th>Выбыл</th>
        </tr>
      </thead>
      <tbody>
        {state.seats.map((s) => (
          <tr key={s.seat} data-team={ROLE_TEAM[s.role]} className={ROLE_TEAM[s.role] === winner ? 'is-won' : ''}>
            <td className="num">{s.seat}</td>
            <td className="nick" title={s.player.nickname}>
              {s.player.nickname}
            </td>
            <td>
              <RoleCell role={s.role} />
            </td>
            <SeatFacts state={state} seat={s.seat} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Краткий ход игры: что происходило по дням и ночам. */
function GameLog({ state }: { state: GameState }) {
  const days = Array.from({ length: state.day }, (_, i) => i + 1);
  // Как в бланке судьи: голосования нумеруются подряд, дни без голосования номер не занимают.
  let votingNo = 0;
  return (
    <div className="game-log">
      <h3>Ход игры</h3>
      {days.map((day) => {
        const noms = state.nominations.filter((n) => n.day === day);
        const votes = state.votes.filter((v) => v.day === day);
        const lifts = state.liftAllVotes.filter((v) => v.day === day);
        const out = state.eliminations.filter((e) => e.day === day && e.kind !== 'killed');
        const night = state.nights.find((n) => n.night === day);
        const fouls = state.fouls.filter((f) => f.day === day);
        if (votes.length) votingNo += 1;
        return (
          <div key={day} className="log-day">
            <div className="log-title">День {day}</div>
            <ul>
              <li>
                Выставления: {noms.length ? noms.map((n) => `№${n.by} → №${n.target}`).join(', ') : 'не было'}
              </li>
              {votes.map((v, i) => (
                <li key={i}>
                  {/* Каждое переголосование — отдельной строкой. */}
                  {i === 0 ? `Голосование ${votingNo}` : votes.length > 2 ? `Переголосование ${i}` : 'Переголосование'}:{' '}
                  {v.candidates.map((c, j) => `№${c} — ${v.votes[j]}`).join(', ')}
                </li>
              ))}
              {lifts.map((l, i) => (
                <li key={`l${i}`}>
                  За подъём всех ({list(l.candidates)}): {l.votesFor} — {l.lifted ? 'ушли все' : 'остались'}
                </li>
              ))}
              {out.length > 0 && (
                <li>
                  Покинули стол:{' '}
                  {out.map((e) => `№${e.seat}${e.kind === 'removed' ? ' (удалён со стола)' : ''}`).join(', ')}
                </li>
              )}
              {fouls.length > 0 && <li>Фолы: {fouls.map((f) => `№${f.seat}`).join(', ')}</li>}
            </ul>
            {night && (
              <>
                <div className="log-title">Ночь {day}</div>
                <ul>
                  <li>{night.kill ? `Убит №${night.kill}` : 'Промах'}</li>
                  {night.donCheck && (
                    <li>
                      Дон проверил №{night.donCheck.target}: {night.donCheck.isSheriff ? 'шериф' : 'не шериф'}
                    </li>
                  )}
                  {night.sheriffCheck && (
                    <li>
                      Шериф проверил №{night.sheriffCheck.target}: {night.sheriffCheck.isBlack ? 'чёрный' : 'красный'}
                    </li>
                  )}
                  {day === 1 && state.bestMove && (
                    <li>
                      Лучший ход №{state.bestMove.seat}: {list(state.bestMove.targets)}, угадано чёрных:{' '}
                      {state.bestMove.blacks}
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
