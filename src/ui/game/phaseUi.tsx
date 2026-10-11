import type { ReactNode } from 'react';
import {
  TEAM_NAMES,
  actsTonight,
  currentCandidates,
  describePhase,
  nightCheckerActive,
  nominatedBy,
  pendingResult,
  seatOf,
  teamOf,
  type GameEvent,
  type GameState,
} from '../../engine';
import { hasNextSpeaker, nick, nominateBlocker } from './rules';

export interface PickerSpec {
  label: string;
  max: number;
  can: (seat: number) => boolean;
  selected: number[];
  onPick: (seat: number) => void;
  /** Нажатие на место на столе тоже выбирает игрока (ночь, лучший ход). */
  tableSelects: boolean;
}

export interface ActionSpec {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Подсказка клавиши для десктопа. */
  kbd?: string;
}

/** Всё, что панель и клавиатура должны знать о текущем шаге игры. */
export interface PhaseUi {
  overline: string;
  heading: string;
  say?: string;
  note?: ReactNode;
  noteTone?: 'warn' | 'info';
  picker?: PickerSpec;
  extra?: ReactNode;
  /** Показать extra над выбором игрока (результат проверки должен быть на виду). */
  extraFirst?: boolean;
  custom?: 'voting' | 'liftAll';
  primary?: ActionSpec;
  secondary?: ActionSpec;
}

interface Args {
  state: GameState;
  dispatch: (event: GameEvent) => boolean;
  selected: number[];
  setSelected: (seats: number[]) => void;
  onShowResults: () => void;
}

export function buildPhaseUi({ state, dispatch, selected, setSelected, onShowResults }: Args): PhaseUi {
  const ui = build({ state, dispatch, selected, setSelected, onShowResults });
  const pending = pendingResult(state);
  if (pending && !ui.note) {
    ui.note = `После этой речи игра завершится: победа — ${TEAM_NAMES[pending.winner]}.`;
    ui.noteTone = 'info';
  }
  return ui;
}

function build({ state, dispatch, selected, setSelected, onShowResults }: Args): PhaseUi {
  const p = state.phase;
  const d = describePhase(state);
  const advance = () => dispatch({ type: 'advance' });
  const next = (label = 'Дальше'): ActionSpec => ({ label, onClick: advance, kbd: 'Enter' });
  const pickOne = (seat: number) => setSelected(selected[0] === seat ? [] : [seat]);
  const who = (seat: number) => `№${seat} · ${nick(state, seat)}`;

  switch (p.kind) {
    case 'night0':
      return {
        overline: 'Ночь 0 · знакомство',
        heading:
          p.step === 'mafiaMeet' ? 'Договорка мафии' : p.step === 'donMeet' ? 'Дон знакомится с ведущим' : 'Шериф смотрит на город',
        say: d.prompt,
        primary: next(),
      };

    case 'speech': {
      const speaker = p.seat;
      const mine = nominatedBy(state, speaker);
      return {
        overline: `День ${state.day} · речи`,
        heading: `Говорит ${who(speaker)}`,
        note: p.shortened ? 'Сокращённая речь: у игрока три фола.' : undefined,
        noteTone: 'warn',
        picker: {
          label: mine.length
            ? `№${speaker} выставил №${mine[0]}. Нажмите на него ещё раз, чтобы снять.`
            : `Кого выставляет №${speaker}?`,
          max: 1,
          can: (n) => mine.includes(n) || nominateBlocker(state, n) === null,
          selected: mine,
          onPick: (n) => dispatch(mine.includes(n) ? { type: 'cancelNomination', target: n } : { type: 'nominate', target: n }),
          tableSelects: false,
        },
        extra: <CandidatesLine state={state} dispatch={dispatch} />,
        primary: next(hasNextSpeaker(state) ? 'Следующий игрок' : 'Закончить речи'),
      };
    }

    case 'tieSpeech':
      return {
        overline: `День ${state.day} · попил`,
        heading: `Оправдание ${who(p.seat)}`,
        say: d.prompt,
        primary: next(),
      };

    case 'farewell':
      return {
        overline: p.reason === 'killed' ? `Утро · день ${state.day + 1}` : `День ${state.day}`,
        heading: `Прощальная речь ${who(p.seat)}`,
        say: d.prompt,
        primary: next(),
      };

    case 'voting':
      return {
        overline: `День ${state.day} · ${p.round === 'main' ? 'голосование' : 'переголосование'}`,
        heading: p.round === 'main' ? 'Голосование' : 'Переголосование',
        say: d.prompt,
        custom: 'voting',
      };

    case 'liftAllVote':
      return {
        overline: `День ${state.day} · повторный попил`,
        heading: 'Голосование за подъём всех',
        say: d.prompt,
        custom: 'liftAll',
      };

    case 'night': {
      const target = selected[0];
      if (p.step === 'shoot') {
        return {
          overline: `Ночь ${state.day}`,
          heading: 'Стрельба мафии',
          say: d.prompt,
          picker: {
            label: 'В кого стреляла мафия?',
            max: 1,
            can: (n) => seatOf(state, n).status === 'alive',
            selected,
            onPick: pickOne,
            tableSelects: true,
          },
          primary: {
            label: target === undefined ? 'Выберите игрока' : `Убит ${who(target)}`,
            disabled: target === undefined,
            onClick: () => target !== undefined && dispatch({ type: 'shoot', target }),
            kbd: 'Enter',
          },
          secondary: { label: 'Промах', onClick: () => dispatch({ type: 'shoot', target: null }), kbd: 'N' },
        };
      }
      const isDon = p.step === 'donCheck';
      const role = isDon ? 'Дон' : 'Шериф';
      if (!nightCheckerActive(state, p.step)) {
        return {
          overline: `Ночь ${state.day}`,
          heading: isDon ? 'Проверка дона' : 'Проверка шерифа',
          say: d.prompt,
          note: `${role} выбыл. Объявите фазу как обычно и выдержите паузу, чтобы игроки не догадались.`,
          noteTone: 'warn',
          primary: next(),
        };
      }
      const checker = state.seats.find((s) => s.role === (isDon ? 'don' : 'sheriff'));
      let result: ReactNode = null;
      if (target !== undefined) {
        const seat = seatOf(state, target);
        const positive = isDon ? seat.role === 'sheriff' : teamOf(seat) === 'black';
        const text = isDon ? (positive ? 'Шериф' : 'Не шериф') : positive ? 'Мафия' : 'Мирный';
        result = (
          <div className={`check-result ${positive ? 'is-positive' : ''}`}>
            <span className="check-result-label">№{target}</span>
            <span className="check-result-value">{text}</span>
          </div>
        );
      }
      return {
        overline: `Ночь ${state.day}`,
        heading: isDon ? 'Проверка дона' : 'Проверка шерифа',
        say: d.prompt,
        picker: {
          label: `Кого проверяет ${isDon ? 'дон' : 'шериф'}?`,
          max: 1,
          can: (n) => n !== checker?.seat && actsTonight(state, seatOf(state, n)),
          selected,
          onPick: pickOne,
          tableSelects: true,
        },
        extra: result,
        extraFirst: true,
        primary: {
          label: 'Записать проверку',
          disabled: target === undefined,
          onClick: () => target !== undefined && dispatch({ type: 'check', target }),
          kbd: 'Enter',
        },
        secondary: { label: 'Без проверки', onClick: advance, kbd: 'N' },
      };
    }

    case 'morning':
      return {
        overline: `Утро · день ${state.day + 1}`,
        heading: p.killed === null ? 'Ночью никто не убит' : `Убит ${who(p.killed)}`,
        say: d.prompt,
        primary: next(),
      };

    case 'bestMove':
      return {
        overline: 'Утро · лучший ход',
        heading: `Лучший ход ${who(p.seat)}`,
        say: d.prompt,
        picker: {
          label: 'Кого назвал игрок? До трёх номеров.',
          max: 3,
          can: (n) => n !== p.seat,
          selected,
          onPick: (n) =>
            setSelected(selected.includes(n) ? selected.filter((x) => x !== n) : selected.length >= 3 ? selected : [...selected, n]),
          tableSelects: true,
        },
        primary: {
          label: `Записать: ${selected.length} из 3`,
          disabled: selected.length === 0,
          onClick: () => dispatch({ type: 'bestMove', targets: selected }),
          kbd: 'Enter',
        },
        secondary: {
          label: 'Без лучшего хода',
          onClick: () => {
            setSelected([]);
            advance();
          },
          kbd: 'N',
        },
      };

    case 'finished':
      return {
        overline: 'Итог',
        heading: 'Игра завершена',
        say: d.prompt,
        primary: { label: 'К итогам', onClick: onShowResults, kbd: 'Enter' },
      };
  }
}

function CandidatesLine({ state, dispatch }: { state: GameState; dispatch: (e: GameEvent) => boolean }) {
  const candidates = currentCandidates(state);
  return (
    <div className="candidates">
      <div className="section-label">На голосовании</div>
      {candidates.length === 0 ? (
        <div className="muted">Пока никого</div>
      ) : (
        <div className="candidates-list">
          {candidates.map((c, i) => {
            const by = state.nominations.find((n) => n.day === state.day && n.target === c)?.by;
            return (
              <div key={c} className="candidate">
                <span className="candidate-order">{i + 1}</span>
                <span className="candidate-no">№{c}</span>
                <span className="candidate-by">от №{by}</span>
                <button
                  className="candidate-remove"
                  onClick={() => dispatch({ type: 'cancelNomination', target: c })}
                  aria-label={`Снять выставление №${c}`}
                >
                  Снять
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
