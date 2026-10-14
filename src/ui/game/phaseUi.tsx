import type { ReactNode } from 'react';
import {
  NIGHT0_MARKS,
  ROLE_NAMES,
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
  type Night0Step,
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
  /** Ник игрока под заголовком. Строка есть всегда, чтобы высота шапки не менялась. */
  sub?: string;
  say?: string;
  note?: ReactNode;
  noteTone?: 'warn' | 'info';
  picker?: PickerSpec;
  extra?: ReactNode;
  /** Блок на месте фразы ведущего, той же высоты: результат проверки после выбора игрока. */
  callout?: ReactNode;
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

  switch (p.kind) {
    case 'night0':
      return night0Ui(state, p.step, d.prompt, dispatch, next);

    case 'speech': {
      const speaker = p.seat;
      const mine = nominatedBy(state, speaker);
      return {
        overline: `День ${state.day} · речи`,
        heading: `Говорит №${speaker}`,
        sub: nick(state, speaker),
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
        heading: `Оправдание №${p.seat}`,
        sub: nick(state, p.seat),
        say: d.prompt,
        primary: next(),
      };

    case 'farewell':
      return {
        overline: p.reason === 'killed' ? `Утро · день ${state.day + 1}` : `День ${state.day}`,
        heading: `Прощальная речь №${p.seat}`,
        sub: nick(state, p.seat),
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
        heading: 'Подъём всех',
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
            label: target === undefined ? 'Выберите игрока' : `Убит №${target}`,
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
        callout: result ?? undefined,
        primary: {
          label: 'Записать',
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
        heading: p.killed === null ? 'Ночью никто не убит' : `Убит №${p.killed}`,
        sub: p.killed === null ? undefined : nick(state, p.killed),
        say: d.prompt,
        primary: next(),
      };

    case 'bestMove':
      return {
        overline: 'Утро · лучший ход',
        heading: `Лучший ход №${p.seat}`,
        sub: nick(state, p.seat),
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
          label: 'Пропустить',
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

const NIGHT0_HEADINGS: Record<Night0Step, string> = {
  deal: 'Раздача карт',
  mafiaMeet: 'Договорка мафии',
  donMeet: 'Дон знакомится с ведущим',
  sheriffMeet: 'Шериф смотрит на город',
};

/** Ночь 0: ведущий раздаёт карты, потом отмечает на столе тех, кто проснулся. */
function night0Ui(
  state: GameState,
  step: Night0Step,
  say: string,
  dispatch: (event: GameEvent) => boolean,
  next: (label?: string) => ActionSpec,
): PhaseUi {
  const base = { overline: 'Ночь 0 · знакомство', heading: NIGHT0_HEADINGS[step], say };
  const marks = NIGHT0_MARKS[step];
  if (!marks) {
    return {
      ...base,
      note: 'Роли пока никто не знает. Ведущий отметит их, когда игроки проснутся.',
      primary: next('Карты розданы'),
    };
  }
  const [role, unmark] = marks;
  const c = state.composition;
  const marked = state.seats.filter((x) => (step === 'mafiaMeet' ? teamOf(x) === 'black' : x.role === role)).map((x) => x.seat);
  const need = step === 'mafiaMeet' ? c.mafia + c.don : c[role];
  const done = marked.length === need;
  const can = (n: number) => {
    const seat = seatOf(state, n);
    if (step === 'mafiaMeet') return marked.length < need;
    if (step === 'donMeet') return teamOf(seat) === 'black';
    return teamOf(seat) === 'red';
  };
  const label =
    step === 'mafiaMeet'
      ? `Кто проснулся? ${c.don ? 'Отметьте всю мафию вместе с доном' : 'Отметьте мафию'}: ${marked.length} из ${need}.`
      : step === 'donMeet'
        ? 'Кто из мафии дон?'
        : 'Кто шериф?';
  return {
    ...base,
    picker: {
      label,
      max: need,
      can,
      selected: marked,
      onPick: (n) => {
        // В договорку снимаем отметку с любого чёрного, на остальных шагах — только с отмеченной роли.
        const on = step === 'mafiaMeet' ? teamOf(seatOf(state, n)) === 'black' : seatOf(state, n).role === role;
        dispatch({ type: 'setRole', seat: n, role: on ? unmark : role });
      },
      tableSelects: true,
    },
    primary: {
      ...next(),
      label: done ? 'Дальше' : step === 'mafiaMeet' ? `Отмечено ${marked.length} из ${need}` : `Отметьте ${ROLE_NAMES[role].toLowerCase()}а`,
      disabled: !done,
    },
  };
}

function CandidatesLine({ state, dispatch }: { state: GameState; dispatch: (e: GameEvent) => boolean }) {
  const candidates = currentCandidates(state);
  return (
    <div className="candidates">
      <div className="section-label">
        На голосовании{candidates.length === 0 ? ': пока никого' : `: ${candidates.length}`}
      </div>
      {candidates.length > 0 && (
        <div className="cand-chips">
          {candidates.map((c, i) => {
            const by = state.nominations.find((n) => n.day === state.day && n.target === c)?.by;
            return (
              <span key={c} className="cand-chip">
                <span className="cand-order">{i + 1}</span>
                <b>№{c}</b>
                <span className="cand-by">от №{by}</span>
                <button
                  className="cand-remove"
                  onClick={() => dispatch({ type: 'cancelNomination', target: c })}
                  aria-label={`Снять выставление №${c}`}
                  title="Снять выставление"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
