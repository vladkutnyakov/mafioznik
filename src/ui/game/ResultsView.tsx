import {
  FINISH_REASON_NAMES,
  ROLE_NAMES,
  TEAM_NAMES,
  computeScores,
  type GameEvent,
  type GameState,
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

export function ResultsView({ state, dispatch, onSave, onShowTable }: Props) {
  const scores = computeScores(state) ?? [];
  const result = state.result!;
  const sc = state.regulation.scoring;

  const setExtra = (seat: number, value: number) => {
    const clamped = Math.min(sc.extraMax, Math.max(sc.extraMin, Math.round(value * 100) / 100));
    dispatch({ type: 'setExtraPoints', seat, value: clamped });
  };

  return (
    <div className="results">
      <div className="results-head" data-team={result.winner}>
        <div>
          <div className="results-winner">Победа: {TEAM_NAMES[result.winner]}</div>
          <div className="muted">{FINISH_REASON_NAMES[result.reason]}</div>
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
      <table className="score-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Игрок</th>
            <th>Роль</th>
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
                <span className={`seat-role ${s.team === 'red' ? 'is-red' : 'is-black'}`}>
                  <i className={`dot ${s.team === 'red' ? 'dot-red' : 'dot-black'}`} />
                  {ROLE_NAMES[s.role]}
                </span>
              </td>
              <td>{fmt(s.base)}</td>
              <td>{s.bestMove ? signed(s.bestMove) : '—'}</td>
              <td className={s.penalty ? 'penalty' : ''}>{s.penalty ? `−${fmt(s.penalty)}` : '—'}</td>
              <td>
                <div className="stepper">
                  <button
                    className="icon-btn"
                    disabled={s.extra <= sc.extraMin}
                    onClick={() => setExtra(s.seat, s.extra - sc.extraStep)}
                    aria-label="Меньше"
                  >
                    −
                  </button>
                  <span className="stepper-value">{signed(s.extra)}</span>
                  <button
                    className="icon-btn"
                    disabled={s.extra >= sc.extraMax}
                    onClick={() => setExtra(s.seat, s.extra + sc.extraStep)}
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

      <GameLog state={state} />
      </div>
    </div>
  );
}

/** Краткий ход игры: что происходило по дням и ночам. */
function GameLog({ state }: { state: GameState }) {
  const days = Array.from({ length: state.day }, (_, i) => i + 1);
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
        return (
          <div key={day} className="log-day">
            <div className="log-title">День {day}</div>
            <ul>
              <li>
                Выставления: {noms.length ? noms.map((n) => `№${n.by} → №${n.target}`).join(', ') : 'не было'}
              </li>
              {votes.map((v, i) => (
                <li key={i}>
                  {v.round === 'main' ? 'Голосование' : 'Переголосование'}:{' '}
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
                  {out.map((e) => `№${e.seat}${e.kind === 'removed' ? ' (удалён)' : ''}`).join(', ')}
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
