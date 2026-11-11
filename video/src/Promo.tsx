import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import gamesData from './data/games.json';
import { Chip, Shell, Shot, TitleBlock } from './components';
import { FPS, SECONDS, type VideoGame, ui } from './theme';

const GAMES = gamesData as VideoGame[];
const at = (seconds: number) => Math.round(seconds * FPS);

function screenshot(game: VideoGame, lang: 'en' | 'zh', index: number): string {
  const list = game.screens[lang] ?? game.screens.en;
  const file = list[index % Math.max(1, list.length)] ?? list[0] ?? 'home.png';
  return `shots/${game.slug}/${lang}/${file}`;
}

function currentWord(lang: 'en' | 'zh'): string {
  return lang === 'zh' ? '分' : 'PTS';
}

function Hook({ game, lang }: { game: VideoGame; lang: 'en' | 'zh' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  return (
    <Shell game={game}>
      <div style={{ opacity: enter }}>
        <TitleBlock game={game} lang={lang} y={190} />
      </div>
      <Shot src={screenshot(game, lang, 1)} width={820} x={930} y={145} rotate={1.7} enter={10} />
      <div style={{ position: 'absolute', left: 120, bottom: 96, display: 'flex', gap: 12 }}>
        <Chip text={`${game.players} · ${game.time}`} game={game} />
        <Chip text={`${ui(lang).watch}`} game={game} />
      </div>
    </Shell>
  );
}

function Title({ game, lang }: { game: VideoGame; lang: 'en' | 'zh' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 180 } });
  return (
    <Shell game={game} dark>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ opacity: enter, translate: `0 ${(1 - enter) * 30}px` }}>
          <div style={{ fontSize: 20, letterSpacing: '0.34em', color: game.accent, textTransform: 'uppercase', fontWeight: 700 }}>
            {ui(lang).eyebrow}
          </div>
          <div
            style={{
              marginTop: 28,
              fontFamily: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", Georgia, serif',
              fontSize: 156,
              lineHeight: 0.92,
              letterSpacing: '-0.06em',
              color: game.paper,
            }}
          >
            {lang === 'zh' ? game.titleZh : game.title}
          </div>
          <div style={{ marginTop: 22, fontSize: 38, color: 'rgba(255,250,240,.72)' }}>
            {lang === 'zh' ? game.taglineZh : game.tagline}
          </div>
          <div style={{ marginTop: 42, display: 'flex', gap: 14, justifyContent: 'center' }}>
            <Chip text={lang === 'zh' ? game.playersZh : game.players} game={game} dim />
            <Chip text={lang === 'zh' ? game.timeZh : game.time} game={game} dim />
            <Chip text={`${lang === 'zh' ? '年龄' : 'Ages'} ${game.age}`} game={game} dim />
          </div>
        </div>
      </AbsoluteFill>
    </Shell>
  );
}

function Board({ game, lang }: { game: VideoGame; lang: 'en' | 'zh' }) {
  const facts = lang === 'zh' ? game.factsZh : game.facts;
  return (
    <Shell game={game}>
      <Shot src={screenshot(game, lang, 1)} width={1120} x={80} y={140} rotate={-1.2} />
      <div style={{ position: 'absolute', left: 1290, top: 190, width: 510 }}>
        <div style={{ fontSize: 18, letterSpacing: '0.26em', color: game.accent, textTransform: 'uppercase', fontWeight: 700 }}>
          {ui(lang).watch}
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", Georgia, serif',
            fontSize: 72,
            lineHeight: 1.02,
            letterSpacing: '-0.04em',
          }}
        >
          {lang === 'zh' ? '这是真的。' : 'This is real.'}
        </div>
        <div style={{ marginTop: 14, fontSize: 24, color: 'rgba(60,50,40,.62)', lineHeight: 1.5 }}>
          {lang === 'zh' ? '画面来自真实运行的应用，不是手绘假界面。' : 'Every frame comes from the running app, not a mockup.'}
        </div>
        <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {facts.slice(0, 3).map((fact) => (
            <div
              key={fact}
              style={{
                padding: '15px 20px',
                borderRadius: 16,
                border: '1px solid rgba(80,65,48,.14)',
                background: 'rgba(255,250,240,.72)',
                fontSize: 23,
              }}
            >
              {fact}
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

function Modes({ game, lang }: { game: VideoGame; lang: 'en' | 'zh' }) {
  const copy = ui(lang);
  return (
    <Shell game={game}>
      <div style={{ position: 'absolute', left: 120, top: 90, width: 900 }}>
        <div style={{ fontSize: 18, letterSpacing: '0.26em', color: game.accent, textTransform: 'uppercase', fontWeight: 700 }}>
          {lang === 'zh' ? '一张桌子' : 'ONE TABLE'}
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", Georgia, serif',
            fontSize: 78,
            lineHeight: 1.02,
            letterSpacing: '-0.04em',
          }}
        >
          {lang === 'zh' ? '三种玩法。' : 'Three ways to play.'}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 120, top: 330, display: 'flex', flexDirection: 'column', gap: 18, width: 800 }}>
        {[
          { t: copy.solo, b: copy.soloBody },
          { t: copy.hotseat, b: `${lang === 'zh' ? game.playersZh : game.players} · ${copy.hotseatBody}` },
          { t: copy.lan, b: copy.lanBody },
        ].map((item) => (
          <div
            key={item.t}
            style={{
              border: '1px solid rgba(80,65,48,.16)',
              background: 'rgba(255,250,240,.78)',
              borderRadius: 20,
              padding: '16px 24px',
            }}
          >
            <div style={{ fontFamily: '"Iowan Old Style", Georgia, serif', fontSize: 30 }}>{item.t}</div>
            <div style={{ marginTop: 5, fontSize: 19, color: 'rgba(60,50,40,.64)', lineHeight: 1.45 }}>{item.b}</div>
          </div>
        ))}
      </div>
      <Shot src={screenshot(game, lang, 0)} width={720} x={1050} y={200} rotate={2.2} enter={18} />
    </Shell>
  );
}

function Details({ game, lang }: { game: VideoGame; lang: 'en' | 'zh' }) {
  const copy = ui(lang);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const tiles = [
    { t: copy.autosave, d: lang === 'zh' ? '关掉，下次接着玩。' : 'Close it. Continue later.' },
    { t: copy.undo, d: lang === 'zh' ? '走错了，可以退回来。' : 'Take a move back.' },
    { t: copy.bilingual, d: lang === 'zh' ? '一键切换，不丢对局。' : 'Switch without losing the game.' },
  ];
  return (
    <Shell game={game}>
      <div style={{ position: 'absolute', left: 120, top: 92, width: 900 }}>
        <div style={{ fontSize: 18, letterSpacing: '0.26em', color: game.accent, textTransform: 'uppercase', fontWeight: 700 }}>
          {lang === 'zh' ? '细节' : 'DETAILS'}
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", Georgia, serif',
            fontSize: 76,
            lineHeight: 1.02,
            letterSpacing: '-0.04em',
          }}
        >
          {copy.details}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 120, top: 330, display: 'flex', gap: 18, width: 980 }}>
        {tiles.map((tile, index) => (
          <div
            key={tile.t}
            style={{
              flex: 1,
              borderRadius: 22,
              border: '1px solid rgba(80,65,48,.15)',
              background: 'rgba(255,250,240,.76)',
              padding: '24px 22px',
              opacity: enter,
              translate: `0 ${(1 - enter) * 20 + index * 2}px`,
            }}
          >
            <div style={{ fontFamily: '"Iowan Old Style", Georgia, serif', fontSize: 30 }}>{tile.t}</div>
            <div style={{ marginTop: 8, fontSize: 19, lineHeight: 1.5, color: 'rgba(60,50,40,.64)' }}>{tile.d}</div>
          </div>
        ))}
      </div>
      <Shot src={screenshot(game, lang, 2)} width={760} x={1060} y={180} rotate={1.2} enter={20} />
      <div style={{ position: 'absolute', left: 120, bottom: 80, display: 'flex', gap: 12 }}>
        <Chip text={copy.privacy} game={game} />
      </div>
    </Shell>
  );
}

function Family({ game, lang }: { game: VideoGame; lang: 'en' | 'zh' }) {
  return (
    <Shell game={game} dark>
      <div style={{ position: 'absolute', left: 120, top: 150, width: 860 }}>
        <div style={{ fontSize: 18, letterSpacing: '0.3em', color: game.accent, textTransform: 'uppercase', fontWeight: 700 }}>
          {ui(lang).collection}
        </div>
        <div
          style={{
            marginTop: 20,
            fontFamily: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", Georgia, serif',
            fontSize: 112,
            lineHeight: 0.96,
            letterSpacing: '-0.055em',
            color: game.paper,
          }}
        >
          {lang === 'zh' ? '给一大家子。' : 'For the whole table.'}
        </div>
        <div style={{ marginTop: 24, fontSize: 28, lineHeight: 1.55, color: 'rgba(255,250,240,.7)', maxWidth: 760 }}>
          {lang === 'zh'
            ? '祖父母、父母和孩子可以坐在同一张桌子旁。几分钟学会，然后一局接一局。'
            : 'Grandparents, parents and kids at one table. A few minutes to learn, then one more round.'}
        </div>
        <div style={{ marginTop: 34, display: 'flex', gap: 12 }}>
          <Chip text={ui(lang).privacy} game={game} dim />
          <Chip text={`${game.players} · ${game.time}`} game={game} dim />
        </div>
      </div>
      <Shot src={screenshot(game, lang, 0)} width={760} x={1070} y={180} rotate={-2.4} enter={15} />
    </Shell>
  );
}

function End({ game, lang }: { game: VideoGame; lang: 'en' | 'zh' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  return (
    <Shell game={game}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ opacity: enter }}>
          <div style={{ fontSize: 20, letterSpacing: '0.34em', color: game.accent, textTransform: 'uppercase', fontWeight: 700 }}>
            FAMILY ARCADE
          </div>
          <div
            style={{
              marginTop: 26,
              fontFamily: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", Georgia, serif',
              fontSize: 128,
              lineHeight: 0.95,
              letterSpacing: '-0.06em',
            }}
          >
            {lang === 'zh' ? game.titleZh : game.title}
          </div>
          <div style={{ marginTop: 20, fontSize: 34, color: 'rgba(60,50,40,.64)' }}>
            {ui(lang).privacy}
          </div>
          <div style={{ marginTop: 36, display: 'flex', justifyContent: 'center', gap: 12 }}>
            <Chip text={lang === 'zh' ? '27 款游戏' : '27 games'} game={game} />
            <Chip text={lang === 'zh' ? '一个仓库' : 'one repository'} game={game} />
            <Chip text={lang === 'zh' ? '每一款都能局域网' : 'LAN in every game'} game={game} />
          </div>
        </div>
      </AbsoluteFill>
    </Shell>
  );
}

function Subtitles({ game, lang }: { game: VideoGame; lang: 'en' | 'zh' }) {
  const frame = useCurrentFrame();
  const time = frame / FPS;
  const line = [...game.lines].reverse().find((item) => time >= item.at);
  if (!line) return null;
  const end = line.at + Math.max(2.2, lang === 'zh' ? line.zhDuration ?? 3 : line.enDuration ?? 3) + 0.4;
  if (time > end) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 36,
        transform: 'translateX(-50%)',
        maxWidth: 1500,
        textAlign: 'center',
        padding: '12px 24px',
        borderRadius: 14,
        background: 'rgba(30,26,22,.78)',
        color: '#fff8ec',
        fontSize: 30,
        lineHeight: 1.35,
      }}
    >
      {lang === 'zh' ? line.zh : line.en}
    </div>
  );
}

function Soundtrack({ game, lang }: { game: VideoGame; lang: 'en' | 'zh' }) {
  return (
    <>
      <Audio src={staticFile('audio/bed.wav')} volume={0.07} />
      {game.lines.map((line, index) => {
        const file = lang === 'zh' ? line.zhFile : line.enFile;
        const duration = lang === 'zh' ? line.zhDuration : line.enDuration;
        if (!file) return null;
        return (
          <Sequence
            key={index}
            from={at(line.at)}
            durationInFrames={at(Math.max(1.2, (duration ?? 3) + 0.35))}
            premountFor={30}
          >
            <Audio src={staticFile(file)} volume={1} />
          </Sequence>
        );
      })}
    </>
  );
}

export function Promo({ slug, lang }: { slug: string; lang: 'en' | 'zh' }) {
  const game = GAMES.find((item) => item.slug === slug);
  if (!game) return <AbsoluteFill />;
  const scenes = [
    { from: 0, duration: 5, C: Hook },
    { from: 5, duration: 4.5, C: Title },
    { from: 9.5, duration: 9, C: Board },
    { from: 18.5, duration: 9, C: Modes },
    { from: 27.5, duration: 8, C: Details },
    { from: 35.5, duration: 6, C: Family },
    { from: 41.5, duration: 3.5, C: End },
  ] as const;
  return (
    <AbsoluteFill>
      {scenes.map(({ from, duration, C }, index) => (
        <Sequence key={index} from={at(from)} durationInFrames={at(duration)} premountFor={30}>
          <C game={game} lang={lang} />
        </Sequence>
      ))}
      <Subtitles game={game} lang={lang} />
      <Soundtrack game={game} lang={lang} />
    </AbsoluteFill>
  );
}
