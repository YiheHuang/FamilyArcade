import { useEffect, useMemo, useState } from 'react';
import gamesData from './data/games.json';
import packagesData from './data/packages.json';

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

interface GamePackage {
  asset: string;
  bytes: number;
  sha256: string;
  url?: string;
}

interface Packages {
  repo: string;
  tag: string;
  games: Record<string, GamePackage>;
}

interface Progress {
  slug: string;
  received: number;
  total: number;
}

type Lang = 'en' | 'zh';
const LITE = __HUB_LITE__;
const GAMES = gamesData as HubGame[];
const PACKAGES = packagesData as Packages;

const COPY = {
  en: {
    brand: 'Family Arcade',
    brandLite: 'Family Arcade Lite',
    search: 'Search games…',
    all: 'All',
    classic: 'Classics',
    family: 'Family table',
    arcade: 'Arcade',
    headline: 'Pick a game.',
    games: 'games',
    play: 'Play',
    install: 'Install',
    downloading: 'Downloading',
    installed: 'Installed',
    remove: 'Remove',
    players: 'players',
    lan: 'LAN',
    footer: 'Offline · no account · no ads · LAN in every game',
    footerLite: 'Download what you play · no account · no ads · LAN in every game',
    language: '中文',
    settings: 'Settings',
    close: 'Close',
    downloadKey: 'GitHub download key',
    downloadKeyHint: 'A read-only token for the private game packages. It stays on this device.',
    tokenSet: 'Key saved',
    tokenMissing: 'No key saved',
    save: 'Save',
    clear: 'Clear',
    saved: 'Saved',
    storage: 'Game library',
    used: 'used',
    installedGames: 'Installed games',
    noGames: 'No games installed yet.',
    packageMissing: 'This game package is not available yet.',
    desktopOnly: 'Installing games needs the Family Arcade Lite desktop app.',
  },
  zh: {
    brand: '家庭游戏馆',
    brandLite: '家庭游戏馆 Lite',
    search: '搜索游戏…',
    all: '全部',
    classic: '经典',
    family: '家庭牌桌',
    arcade: '小游戏',
    headline: '选一款游戏。',
    games: '款游戏',
    play: '开始',
    install: '安装',
    downloading: '下载中',
    installed: '已安装',
    remove: '删除',
    players: '人',
    lan: '局域网',
    footer: '离线 · 无账号 · 无广告 · 每款都能局域网',
    footerLite: '玩什么装什么 · 无账号 · 无广告 · 每款都能局域网',
    language: 'English',
    settings: '设置',
    close: '关闭',
    downloadKey: 'GitHub 下载密钥',
    downloadKeyHint: '用于下载私有游戏包的只读令牌，只保存在本机。',
    tokenSet: '密钥已保存',
    tokenMissing: '还没有密钥',
    save: '保存',
    clear: '清除',
    saved: '已保存',
    storage: '游戏库',
    used: '已用',
    installedGames: '已安装游戏',
    noGames: '还没有安装游戏。',
    packageMissing: '这款游戏包还没有生成。',
    desktopOnly: '安装游戏需要使用家庭游戏馆 Lite 桌面版。',
  },
} as const;

const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke<T>(command, args);
}

async function launch(slug: string): Promise<void> {
  if (isDesktop()) {
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

function formatBytes(bytes: number): string | null {
  if (!bytes) return null;
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
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
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<Record<string, Progress>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [storage, setStorage] = useState('');
  const [installedSize, setInstalledSize] = useState(0);
  const [notice, setNotice] = useState('');
  const t = COPY[lang];
  const brand = LITE ? t.brandLite : t.brand;

  useEffect(() => {
    const title = LITE ? (lang === 'zh' ? '家庭游戏馆 Lite' : 'Family Arcade Lite') : t.brand;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = title;
    if (isDesktop()) {
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
        .catch(() => undefined);
    }
    localStorage.setItem('familyarcade.lang', lang);
  }, [lang, t.brand]);

  const refresh = async () => {
    if (!LITE || !isDesktop()) return;
    try {
      const [list, size] = await Promise.all([
        invoke<string[]>('list_installed'),
        invoke<number>('installed_size'),
      ]);
      setInstalled(new Set(list));
      setInstalledSize(size);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!LITE || !isDesktop()) return;
    void refresh();
    void invoke<boolean>('token_status').then(setHasToken).catch(() => undefined);
    void invoke<string>('storage_path').then(setStorage).catch(() => undefined);

    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<Progress>('download-progress', (event) => {
          setDownloading((current) => ({ ...current, [event.payload.slug]: event.payload }));
        }),
      )
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, []);

  const games = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return GAMES.filter((game) => {
      if (filter !== 'all' && game.category !== filter) return false;
      if (!needle) return true;
      return `${game.title} ${game.zh}`.toLowerCase().includes(needle);
    });
  }, [filter, query]);

  const install = async (game: HubGame) => {
    setError('');
    setNotice('');
    const pkg = PACKAGES.games[game.slug];
    if (!pkg) {
      setError(t.packageMissing);
      return;
    }
    if (!isDesktop()) {
      setError(t.desktopOnly);
      return;
    }
    setDownloading((current) => ({
      ...current,
      [game.slug]: { slug: game.slug, received: 0, total: pkg.bytes },
    }));
    try {
      await invoke('install_game', {
        slug: game.slug,
        tag: PACKAGES.tag,
        asset: pkg.asset,
        sha256: pkg.sha256,
        bytes: pkg.bytes,
        url: pkg.url,
      });
      setInstalled((current) => new Set(current).add(game.slug));
      await refresh();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setDownloading((current) => {
        const next = { ...current };
        delete next[game.slug];
        return next;
      });
    }
  };

  const play = async (game: HubGame) => {
    setError('');
    setNotice('');
    if (LITE && !installed.has(game.slug)) {
      await install(game);
      return;
    }
    setBusy(game.slug);
    try {
      await launch(game.slug);
    } catch (reason) {
      setError(String(reason));
    } finally {
      window.setTimeout(() => setBusy(null), 600);
    }
  };

  const remove = async (game: HubGame) => {
    setError('');
    try {
      await invoke('uninstall_game', { slug: game.slug });
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const saveToken = async () => {
    setError('');
    try {
      await invoke('set_token', { token });
      setHasToken(token.trim().length > 0);
      setToken('');
      setNotice(t.saved);
    } catch (reason) {
      setError(String(reason));
    }
  };

  const clearToken = async () => {
    setError('');
    try {
      await invoke('clear_token');
      setHasToken(false);
      setToken('');
      setNotice(t.saved);
    } catch (reason) {
      setError(String(reason));
    }
  };

  return (
    <main className="hub">
      <header className="top">
        <div className="brand">
          <span className="mark">FA</span>
          <strong>{brand}</strong>
        </div>
        <div className="top-actions">
          <span className="count">
            {GAMES.length} {t.games}
            {LITE && installed.size > 0 ? ` · ${installed.size} ${t.installed}` : ''}
          </span>
          {LITE && (
            <button className="language" onClick={() => setSettingsOpen(true)}>
              {t.settings}
            </button>
          )}
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
      {notice && <p className="notice" role="status">{notice}</p>}

      <section className="grid" aria-label={brand}>
        {games.map((game) => {
          const progress = downloading[game.slug];
          const isInstalled = LITE && installed.has(game.slug);
          const percent = progress && progress.total > 0
            ? Math.min(100, Math.round((progress.received / progress.total) * 100))
            : null;
          const action = progress ? `${percent ?? 0}%` : LITE && !isInstalled ? t.install : t.play;
          return (
            <article className="card" key={game.slug}>
              <button
                className="cover"
                onClick={() => play(game)}
                aria-label={`${action}: ${lang === 'zh' ? game.zh : game.title}`}
                style={{ background: `${game.accent}18` }}
              >
                <img src={game.thumb} alt="" loading="lazy" />
                <span className="play">{busy === game.slug ? '…' : action}</span>
                {progress && (
                  <span className="progress" aria-hidden="true">
                    <span style={{ width: `${percent ?? 4}%` }} />
                  </span>
                )}
                {LITE && isInstalled && !progress && <span className="installed-badge">{t.installed}</span>}
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
          );
        })}
      </section>

      <footer className="foot">{LITE ? t.footerLite : t.footer}</footer>

      {LITE && settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <section className="modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <h2>{t.settings}</h2>
              <button className="language" onClick={() => setSettingsOpen(false)}>{t.close}</button>
            </header>

            <label className="field">
              <span>{t.downloadKey}</span>
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={hasToken ? t.tokenSet : t.tokenMissing}
              />
            </label>
            <p className="hint">{t.downloadKeyHint}</p>
            <div className="modal-actions">
              <button className="primary" onClick={saveToken}>{t.save}</button>
              <button className="chip" onClick={clearToken}>{t.clear}</button>
            </div>

            <h3>{t.installedGames}</h3>
            <p className="hint">
              {t.storage}: {storage || '—'}
              {formatBytes(installedSize) ? ` · ${formatBytes(installedSize)} ${t.used}` : ''}
            </p>
            {installed.size === 0 ? (
              <p className="hint">{t.noGames}</p>
            ) : (
              <ul className="installed-list">
                {GAMES.filter((game) => installed.has(game.slug)).map((game) => (
                  <li key={game.slug}>
                    <span>{lang === 'zh' ? game.zh : game.title}</span>
                    <button className="chip" onClick={() => remove(game)}>{t.remove}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
