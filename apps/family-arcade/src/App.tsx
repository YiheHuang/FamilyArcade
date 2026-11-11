import { useMemo, useState } from 'react';
import gamesData from './data/games.json';

interface HubGame {
  slug: string;
  title: string;
  zh: string;
  tagline: string;
  taglineZh: string;
  players: string;
  time: string;
  age: string;
  category: 'classic' | 'family' | 'arcade';
  accent: string;
  thumb: string;
}

const GAMES = gamesData as HubGame[];

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function launch(slug: string): Promise<void> {
  if (!isTauri()) {
    window.alert('This launcher runs as a Windows app. In the browser, open the individual game folder instead.');
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('launch_game', { slug });
}

export default function App() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | HubGame['category']>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const games = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return GAMES.filter((game) => {
      if (filter !== 'all' && game.category !== filter) return false;
      if (!needle) return true;
      return `${game.title} ${game.zh} ${game.tagline}`.toLowerCase().includes(needle);
    });
  }, [filter, query]);

  const play = async (game: HubGame) => {
    setError('');
    setBusy(game.slug);
    try {
      await launch(game.slug);
      const recent = JSON.parse(localStorage.getItem('familyarcade.recent') || '[]') as string[];
      localStorage.setItem(
        'familyarcade.recent',
        JSON.stringify([game.slug, ...recent.filter((item) => item !== game.slug)].slice(0, 6)),
      );
    } catch (reason) {
      setError(`Could not start ${game.title}: ${String(reason)}`);
    } finally {
      window.setTimeout(() => setBusy(null), 700);
    }
  };

  return (
    <main className="hub">
      <header className="top">
        <div className="brand">
          <span className="mark">FA</span>
          <div>
            <strong>Family Arcade</strong>
            <span>家庭游戏馆</span>
          </div>
        </div>
        <div className="count">
          <strong>{GAMES.length}</strong>
          <span>games · 一个游戏中心</span>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">ONE TABLE · 27 GAMES</p>
        <h1>Pick a game.<br />Call the family.</h1>
        <p className="lede">
          二十七款离线家庭游戏：棋类、卡牌、骰子、拼放和派对小游戏。每一款都有 AI、
          同屏热座和局域网。装这一个程序，或者只装你想玩的那一款。
        </p>
        <div className="search-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search / 搜索游戏…"
            aria-label="Search games"
          />
          <div className="filters">
            {([
              ['all', '全部'],
              ['classic', '经典'],
              ['family', '家庭牌桌'],
              ['arcade', '小游戏'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? 'chip active' : 'chip'}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="grid" aria-label="Games">
        {games.map((game) => (
          <article className="card" key={game.slug}>
            <button
              className="cover"
              onClick={() => play(game)}
              aria-label={`Play ${game.title}`}
              style={{ background: `${game.accent}18` }}
            >
              <img src={game.thumb} alt={`${game.title} screenshot`} loading="lazy" />
              <span className="play">{busy === game.slug ? 'Starting…' : 'Play'}</span>
            </button>
            <div className="meta">
              <div className="names">
                <h2>{game.title}</h2>
                <span>{game.zh}</span>
              </div>
              <p>{game.tagline}</p>
              <div className="facts">
                <span>{game.players} players</span>
                <span>{game.time}</span>
                <span className="lan">LAN</span>
              </div>
            </div>
          </article>
        ))}
      </section>

      <footer className="foot">
        <span>Offline · no account · no ads · LAN in every game</span>
        <span>所有游戏均可单独安装，也可以从这里统一启动。</span>
      </footer>
    </main>
  );
}
