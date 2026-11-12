import { useEffect, useMemo, useState } from 'react';
import gamesData from './data/games.json';

interface HubGame {
  slug: string;
  title: string;
  zh: string;
  tagline: string;
  taglineZh: string;
  players: string;
  time: string;
  timeZh: string;
  age: string;
  category: 'classic' | 'family' | 'arcade';
  accent: string;
  thumb: string;
}

type Lang = 'en' | 'zh';
const GAMES = gamesData as HubGame[];

const COPY = {
  en: {
    brand: 'Family Arcade',
    search: 'Search games…',
    all: 'All',
    classic: 'Classics',
    family: 'Family table',
    arcade: 'Arcade',
    headline: 'Pick a game.',
    games: 'games',
    play: 'Play',
    players: 'players',
    lan: 'LAN',
    footer: 'Offline · no account · no ads · LAN in every game',
    language: '中文',
  },
  zh: {
    brand: '家庭游戏馆',
    search: '搜索游戏…',
    all: '全部',
    classic: '经典',
    family: '家庭牌桌',
    arcade: '小游戏',
    headline: '选一款游戏。',
    games: '款游戏',
    play: '开始',
    players: '人',
    lan: '局域网',
    footer: '离线 · 无账号 · 无广告 · 每款都能局域网',
    language: 'English',
  },
} as const;

async function launch(slug: string): Promise<void> {
  if ('__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('launch_game', { slug });
    return;
  }
  const bridge = (window as unknown as { familyArcade?: { launch(slug: string): Promise<void> } }).familyArcade;
  if (bridge) {
    await bridge.launch(slug);
    return;
  }
  window.alert('Open the game folder in a browser, or install the Family Arcade desktop app.');
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('familyarcade.lang');
    if (saved === 'en' || saved === 'zh') return saved;
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | HubGame['category']>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const t = COPY[lang];

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    localStorage.setItem('familyarcade.lang', lang);
  }, [lang]);

  const games = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return GAMES.filter((game) => {
      if (filter !== 'all' && game.category !== filter) return false;
      if (!needle) return true;
      return `${game.title} ${game.zh}`.toLowerCase().includes(needle);
    });
  }, [filter, query]);

  const play = async (game: HubGame) => {
    setError('');
    setBusy(game.slug);
    try {
      await launch(game.slug);
    } catch (reason) {
      setError(String(reason));
    } finally {
      window.setTimeout(() => setBusy(null), 600);
    }
  };

  return (
    <main className="hub">
      <header className="top">
        <div className="brand">
          <span className="mark">FA</span>
          <strong>{t.brand}</strong>
        </div>
        <div className="top-actions">
          <span className="count">{GAMES.length} {t.games}</span>
          <button className="language" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {t.language}
          </button>
        </div>
      </header>

      <section className="hero">
        <h1>{t.headline}</h1>
        <div className="search-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.search}
            aria-label={t.search}
          />
          <div className="filters">
            {([
              ['all', t.all],
              ['classic', t.classic],
              ['family', t.family],
              ['arcade', t.arcade],
            ] as const).map(([id, label]) => (
              <button key={id} className={filter === id ? 'chip active' : 'chip'} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="grid" aria-label={t.brand}>
        {games.map((game) => (
          <article className="card" key={game.slug}>
            <button
              className="cover"
              onClick={() => play(game)}
              aria-label={`${t.play}: ${lang === 'zh' ? game.zh : game.title}`}
              style={{ background: `${game.accent}18` }}
            >
              <img src={game.thumb} alt="" loading="lazy" />
              <span className="play">{busy === game.slug ? '…' : t.play}</span>
            </button>
            <div className="meta">
              <h2>{lang === 'zh' ? game.zh : game.title}</h2>
              <div className="facts">
                <span>{game.players} {t.players}</span>
                <span>{lang === 'zh' ? game.timeZh : game.time}</span>
                <span className="lan">{t.lan}</span>
              </div>
            </div>
          </article>
        ))}
      </section>

      <footer className="foot">{t.footer}</footer>
    </main>
  );
}
