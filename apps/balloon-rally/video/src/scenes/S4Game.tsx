import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import game from '../data/game.json';
import { SEAT_THEME } from '../../../src/ui/theme';
import { COPY, type Lang } from '../copy';
import { enter } from '../scene-utils';
import { ACCENT, CARD, INK, LINE, MUTED, SERIF, SANS, MONO, GOLD } from '../theme';

const round = game.rounds[1];
const leaderIndex = round.leaders[0];
const leaderLabel = (lang: Lang) =>
  lang === 'zh' ? (round.leaders.length > 1 ? '并列领先' : '领先') : round.leaders.length > 1 ? 'TIED LEAD' : 'LEAD';
const leaderNames = (lang: Lang) =>
  round.leaders.map((index) => (lang === 'zh' ? game.balloons[index].zh : game.balloons[index].en)).join(' · ');

export function Game({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const titleIn = enter(frame, fps, 0.1);
  const tableIn = enter(frame, fps, 0.85);

  return (
    <AbsoluteFill>
      <Img
        src={staticFile(`shots/${lang}/game.png`)}
        alt={lang === 'zh' ? '真实对局截图' : 'Real game screenshot'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center top',
          opacity: 0.36,
          scale: interpolate(frame, [0, 600], [1.035, 1.0]),
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(90deg, rgba(246,240,227,0.98) 0%, rgba(246,240,227,0.91) 42%, rgba(246,240,227,0.34) 72%, rgba(32,42,46,0.12) 100%)',
        }}
      />

      <div style={{ position: 'absolute', left: 120, top: 120, width: 920 }}>
        <p style={{ fontFamily: SANS, fontSize: 20, letterSpacing: '0.24em', color: ACCENT, fontWeight: 700, margin: 0 }}>
          {copy.roundLabel}
        </p>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: lang === 'zh' ? 100 : 98,
            lineHeight: 1,
            color: INK,
            margin: '14px 0 0',
            fontWeight: 600,
            opacity: titleIn,
          }}
        >
          {copy.gameTitle}
        </h2>
        <p style={{ fontFamily: SANS, fontSize: 27, color: MUTED, marginTop: 14, opacity: titleIn }}>
          {copy.gameBody}
        </p>

        <div style={{ display: 'flex', gap: 14, marginTop: 50 }}>
          {game.balloons.map((balloon, index) => {
            const progress = enter(frame, fps, 1.2 + index * 0.38, 0.55);
            const name = lang === 'zh' ? balloon.zh : balloon.en;
            return (
              <div
                key={balloon.id}
                style={{
                  width: 158,
                  height: 208,
                  borderRadius: 16,
                  border: `2px solid ${balloon.color}`,
                  background: `linear-gradient(180deg, #fffdf8, ${balloon.light})`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: progress,
                  scale: interpolate(progress, [0, 1], [0.82, 1]),
                  rotate: `${interpolate(progress, [0, 1], [-5, 0])}deg`,
                  boxShadow: '0 12px 24px rgba(62,49,31,0.1)',
                }}
              >
                <span style={{ fontFamily: SANS, fontSize: 14, color: MUTED, letterSpacing: '0.08em' }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: 58, lineHeight: 1, color: balloon.color, marginTop: 8 }}>
                  +{round.wind[index]}
                </span>
                <span style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: INK, marginTop: 12 }}>{name}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED, marginTop: 4 }}>
                  {round.positionsBefore[index]} → {round.positionsAfter[index]}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 32, opacity: enter(frame, fps, 2.4) }}>
          <span
            style={{
              background: GOLD,
              color: '#fffdf8',
              fontFamily: SANS,
              fontSize: 15,
              fontWeight: 700,
              borderRadius: 6,
              padding: '5px 10px',
              letterSpacing: '0.08em',
            }}
          >
            {leaderLabel(lang)}
          </span>
          <span style={{ fontFamily: SERIF, fontSize: 30, color: INK }}>
            {leaderNames(lang)} · {round.positionsAfter[leaderIndex]}
          </span>
          <span style={{ fontFamily: SANS, fontSize: 20, color: MUTED }}>{copy.points}</span>
        </div>

        <p style={{ fontFamily: MONO, fontSize: 14, color: MUTED, letterSpacing: '0.06em', marginTop: 26 }}>
          {copy.real} {game.seed}
        </p>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 120,
          top: 170,
          width: 500,
          background: CARD,
          border: `1px solid ${LINE}`,
          borderRadius: 24,
          padding: '26px 28px',
          boxShadow: '0 30px 60px rgba(62,49,31,0.16)',
          opacity: tableIn,
          translate: `0 ${interpolate(tableIn, [0, 1], [30, 0])}px`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ fontFamily: SERIF, fontSize: 30, color: INK }}>{copy.labels.table}</h3>
          <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>{lang === 'zh' ? '总分' : 'TOTAL'}</span>
        </div>
        <div style={{ marginTop: 14 }}>
          {game.scores.map((row, index) => (
            <div
              key={row.seat}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 0',
                borderTop: index === 0 ? 'none' : `1px solid ${LINE}`,
                opacity: enter(frame, fps, 1.15 + index * 0.15),
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: SEAT_THEME[row.seat].color,
                  display: 'inline-block',
                }}
              />
              <span style={{ fontFamily: SANS, fontSize: 21, color: INK, flex: 1 }}>{row.name}</span>
              <span style={{ fontFamily: SANS, fontSize: 14, color: MUTED }}>#{row.rank}</span>
              <span style={{ fontFamily: SERIF, fontSize: 30, color: row.rank === 1 ? GOLD : INK }}>{row.total}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 14, paddingTop: 12, fontFamily: SANS, fontSize: 15, color: MUTED }}>
          {lang === 'zh' ? '领先 +3 · 第二 +1 · 未用顺风 +1' : 'Leader +3 · Second +1 · Unused tailwind +1'}
        </div>
      </div>
    </AbsoluteFill>
  );
}
