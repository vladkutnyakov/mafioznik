import { useEffect, useMemo, useState } from 'react';
import { ROLE_NAMES, outcomeName, type Role } from '../../engine';
import { getArchive } from '../../storage/archive';
import type { Archive } from '../../storage/archive-model';
import { gameSummaries, playerKey, playerStats, winRate, type GameFilter, type GameSummary, type PlayerStats } from '../../storage/stats';
import { ResultsView } from '../game/ResultsView';

interface Props {
  onBack: () => void;
}

type Tab = 'players' | 'games';
type SortKey = 'nickname' | 'games' | 'wins' | 'rate' | 'points' | 'avg' | Role;

const ROLES: Role[] = ['civilian', 'sheriff', 'mafia', 'don'];

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '').replace('.', ','));
const pct = (x: number | null) => (x === null ? '—' : `${x}%`);
const avg = (p: PlayerStats) => (p.scoredGames ? p.points / p.scoredGames : null);
const date = (at: number) => new Date(at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

/** Значение для сортировки: больше — выше. Игроки без игр в роли уходят вниз. */
function sortValue(p: PlayerStats, key: SortKey): number {
  switch (key) {
    case 'nickname':
      return 0;
    case 'games':
      return p.games;
    case 'wins':
      return p.wins;
    case 'rate':
      return winRate(p) ?? -1;
    case 'points':
      return p.scoredGames ? p.points : -Infinity;
    case 'avg':
      return avg(p) ?? -Infinity;
    default:
      return winRate(p.byRole[key]) ?? -1;
  }
}

const filterValue = (f: GameFilter) => (f.kind === 'tournament' ? `t:${f.id}` : f.kind);
const parseFilter = (v: string): GameFilter => (v.startsWith('t:') ? { kind: 'tournament', id: v.slice(2) } : { kind: v as 'all' | 'casual' });

export function HistoryScreen({ onBack }: Props) {
  const [archive, setArchive] = useState<Archive | null>(null);
  const [tab, setTab] = useState<Tab>('players');
  const [filter, setFilter] = useState<GameFilter>({ kind: 'all' });
  const [sort, setSort] = useState<SortKey>('games');
  const [player, setPlayer] = useState<PlayerStats | null>(null);
  const [opened, setOpened] = useState<GameSummary | null>(null);

  useEffect(() => {
    void getArchive().then(setArchive);
  }, []);

  const summaries = useMemo(() => (archive ? gameSummaries(archive, filter) : []), [archive, filter]);
  const stats = useMemo(() => {
    if (!archive) return [];
    const list = playerStats(summaries, archive);
    return list.sort(
      (a, b) =>
        (sort === 'nickname' ? 0 : sortValue(b, sort) - sortValue(a, sort)) ||
        b.games - a.games ||
        a.nickname.localeCompare(b.nickname, 'ru'),
    );
  }, [archive, summaries, sort]);

  const shownGames = useMemo(
    () =>
      player
        ? summaries.filter((s) => s.game.setup.seats.some((x) => playerKey(x.player) === player.key))
        : summaries,
    [summaries, player],
  );

  if (!archive) return null;

  if (opened?.state) {
    const g = opened.game;
    return (
      <div className="screen history">
        <div className="setup-head">
          <button className="btn" onClick={() => setOpened(null)}>
            ← К списку
          </button>
          <div>
            <h1 style={{ fontSize: 22 }}>{gameTitle(opened)}</h1>
            <div className="muted">{date(g.createdAt)}</div>
          </div>
        </div>
        <ResultsView state={opened.state} />
      </div>
    );
  }

  const hasScores = stats.some((p) => p.scoredGames > 0);
  const tournaments = [...archive.tournaments].sort((a, b) => b.createdAt - a.createdAt);
  const th = (key: SortKey, label: string, title?: string) => (
    <th className={`sortable ${sort === key ? 'is-sorted' : ''}`} title={title} onClick={() => setSort(key)}>
      {label}
    </th>
  );

  return (
    <div className="screen history">
      <div className="setup-head">
        <button className="btn" onClick={onBack}>
          ← Назад
        </button>
        <h1 style={{ fontSize: 26 }}>История</h1>
      </div>

      <div className="row wrap history-controls">
        <div className="segmented">
          <button className={tab === 'players' ? 'is-on' : ''} onClick={() => setTab('players')}>
            Игроки
          </button>
          <button className={tab === 'games' ? 'is-on' : ''} onClick={() => setTab('games')}>
            Игры
          </button>
        </div>
        <select
          className="history-filter"
          value={filterValue(filter)}
          onChange={(e) => {
            setFilter(parseFilter(e.target.value));
            setPlayer(null);
          }}
        >
          <option value="all">Все игры</option>
          <option value="casual">Без турнира</option>
          {tournaments.map((t) => (
            <option key={t.id} value={`t:${t.id}`}>
              {t.name}
            </option>
          ))}
        </select>
        {tab === 'games' && player && (
          <button className="btn history-chip" onClick={() => setPlayer(null)}>
            {player.nickname} ✕
          </button>
        )}
      </div>

      {summaries.length === 0 ? (
        <div className="card muted">Сохранённых игр пока нет. Они появятся здесь после кнопки «Сохранить игру».</div>
      ) : tab === 'players' ? (
        <div className="history-scroll">
          <table className="history-table">
            <thead>
              <tr>
                {th('nickname', 'Игрок')}
                {th('games', 'Игр')}
                {th('wins', 'Побед')}
                {th('rate', '%')}
                {ROLES.map((r) => th(r, ROLE_NAMES[r], `Побед ролью «${ROLE_NAMES[r]}»`))}
                {hasScores && th('points', 'Баллы')}
                {hasScores && th('avg', 'Средний')}
                <th title="Убит в первую ночь">ПУ</th>
                <th title="Лучший ход: сколько раз / угадано чёрных">ЛХ</th>
                <th>Фолы</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((p) => (
                <tr
                  key={p.key}
                  onClick={() => {
                    setPlayer(p);
                    setTab('games');
                  }}
                >
                  <td className="nick">{p.nickname}</td>
                  <td>{p.games}</td>
                  <td>{p.wins}</td>
                  <td className="strong">{pct(winRate(p))}</td>
                  {ROLES.map((r) => (
                    <td key={r} className={p.byRole[r].games ? '' : 'muted'}>
                      {p.byRole[r].games ? `${p.byRole[r].wins}/${p.byRole[r].games}` : '—'}
                    </td>
                  ))}
                  {hasScores && <td className="strong">{p.scoredGames ? fmt(p.points) : '—'}</td>}
                  {hasScores && <td>{p.scoredGames ? fmt(Math.round(avg(p)! * 100) / 100) : '—'}</td>}
                  <td>{p.firstKilled || '—'}</td>
                  <td>{p.bestMoves ? `${p.bestMoves} / ${p.bestMoveBlacks}` : '—'}</td>
                  <td>
                    {p.fouls || '—'}
                    {p.sanctions > 0 && <span className="penalty"> · {p.sanctions} уд.</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted history-hint">
            Роли — победы из сыгранных. ПУ — убит в первую ночь. Нажмите на игрока, чтобы увидеть его игры.
          </div>
        </div>
      ) : (
        <div className="history-games">
          {shownGames.map((s) => (
            <GameRow key={s.game.id} summary={s} player={player} onOpen={() => setOpened(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function gameTitle({ game }: GameSummary): string {
  const t = game.setup.tournament;
  return t ? `${t.name} · игра ${t.game} из ${t.games}` : 'Игра';
}

function GameRow({ summary, player, onOpen }: { summary: GameSummary; player: PlayerStats | null; onOpen: () => void }) {
  const { game, state, winner } = summary;
  const seat = player && state?.seats.find((x) => playerKey(x.player) === player.key);
  return (
    <button className="card history-game" data-team={winner ?? undefined} disabled={!state} onClick={onOpen}>
      <div className="history-game-main">
        <b>{gameTitle(summary)}</b>
        <span className="muted">
          {date(game.createdAt)} · {game.setup.seats.length} игроков
        </span>
      </div>
      {seat && (
        <span className="history-game-role">
          №{seat.seat} · {ROLE_NAMES[seat.role]}
        </span>
      )}
      <span className="history-game-winner">
        {state ? (state.result ? outcomeName(state.result) : 'Без итога') : 'Не читается'}
      </span>
    </button>
  );
}
