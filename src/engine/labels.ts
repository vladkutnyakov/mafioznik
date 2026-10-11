import { pendingResult } from './selectors';
import type { FinishReason, GameState, Role, Team } from './types';

export const ROLE_NAMES: Record<Role, string> = {
  civilian: 'Мирный',
  sheriff: 'Шериф',
  mafia: 'Мафия',
  don: 'Дон',
};

export const TEAM_NAMES: Record<Team, string> = {
  red: 'Мирные',
  black: 'Мафия',
};

export const FINISH_REASON_NAMES: Record<FinishReason, string> = {
  allBlacksOut: 'Все чёрные игроки покинули стол',
  blacksParity: 'Чёрных столько же, сколько красных',
  ppk: 'Признание поражения команды (ППК)',
  manual: 'Решение ведущего',
};

const list = (seats: number[]) => seats.map((n) => `№${n}`).join(', ');

export interface PhaseDescription {
  /** Короткий заголовок для шапки: «День 2 · Речь №5». */
  title: string;
  /** Что ведущий говорит или делает сейчас. */
  prompt: string;
}

export function describePhase(s: GameState): PhaseDescription {
  const base = describeBase(s);
  const pending = pendingResult(s);
  if (!pending) return base;
  return { ...base, prompt: `${base.prompt} Затем игра завершится: победа — ${TEAM_NAMES[pending.winner]}.` };
}

function describeBase(s: GameState): PhaseDescription {
  const p = s.phase;
  const day = `День ${s.day}`;
  const night = `Ночь ${s.day}`;
  switch (p.kind) {
    case 'night0':
      if (p.step === 'mafiaMeet')
        return { title: 'Ночь 0 · Договорка', prompt: 'Наступает ночь. Мафия просыпается и договаривается.' };
      if (p.step === 'donMeet')
        return { title: 'Ночь 0 · Дон', prompt: 'Мафия засыпает. Дон просыпается и знакомится с ведущим.' };
      return { title: 'Ночь 0 · Шериф', prompt: 'Дон засыпает. Шериф просыпается и смотрит на город.' };
    case 'speech':
      return {
        title: `${day} · Речь №${p.seat}`,
        prompt: p.shortened
          ? `Слово игроку №${p.seat}. Сокращённая речь из-за третьего фола.`
          : `Слово игроку №${p.seat}.`,
      };
    case 'voting':
      return {
        title: `${day} · ${p.round === 'main' ? 'Голосование' : 'Переголосование'}`,
        prompt: `На голосовании игроки ${list(p.candidates)}. Голосуем по порядку выставления.`,
      };
    case 'tieSpeech':
      return {
        title: `${day} · Оправдание №${p.seat}`,
        prompt: `Голоса разделились. Оправдательная речь игрока №${p.seat}.`,
      };
    case 'liftAllVote':
      return {
        title: `${day} · Подъём всех`,
        prompt: `Кто за то, чтобы игроки ${list(p.candidates)} покинули стол?`,
      };
    case 'farewell':
      return {
        title: `${day} · Прощальная речь №${p.seat}`,
        prompt: `Игрок №${p.seat}, ваша прощальная речь.`,
      };
    case 'night':
      if (p.step === 'shoot')
        return { title: `${night} · Стрельба`, prompt: 'Наступает ночь. Мафия выходит на охоту.' };
      if (p.step === 'donCheck')
        return { title: `${night} · Проверка дона`, prompt: 'Мафия засыпает. Дон просыпается и ищет шерифа.' };
      return { title: `${night} · Проверка шерифа`, prompt: 'Дон засыпает. Шериф просыпается и делает проверку.' };
    case 'morning':
      return {
        title: `Утро · День ${s.day + 1}`,
        prompt:
          p.killed === null
            ? 'Город просыпается. Этой ночью никто не убит.'
            : `Город просыпается. Этой ночью убит игрок №${p.killed}.`,
      };
    case 'bestMove':
      return {
        title: `Лучший ход №${p.seat}`,
        prompt: `Игрок №${p.seat}, назовите трёх игроков, которых считаете мафией.`,
      };
    case 'finished': {
      const r = s.result;
      return {
        title: 'Игра завершена',
        prompt: r ? `Победа: ${TEAM_NAMES[r.winner]}. ${FINISH_REASON_NAMES[r.reason]}.` : 'Игра завершена.',
      };
    }
  }
}
