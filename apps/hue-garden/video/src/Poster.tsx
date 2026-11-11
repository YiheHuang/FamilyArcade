import { AbsoluteFill } from 'remotion';
import { COPY, type Lang } from './copy';
import { Backdrop } from './Backdrop';
import { TileSvg } from './Diagrams';
import { ACCENT, INK, MUTED, SERIF, SANS } from './theme';

export function Poster({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  return (
    <Backdrop>
      <AbsoluteFill>
        <div style={{ position: 'absolute', left: 120, top: 210, maxWidth: 980 }}>
          <div style={{ fontSize: 19, letterSpacing: '0.26em', color: ACCENT, textTransform: 'uppercase' }}>
            {copy.eyebrow}
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: lang === 'zh' ? 190 : 148,
              lineHeight: 0.95,
              letterSpacing: '-0.055em',
              color: INK,
              marginTop: 18,
              fontWeight: 600,
            }}
          >
            {copy.title}
          </div>
          <div
            style={{
              fontFamily: SANS,
              fontSize: 21,
              fontWeight: 700,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: ACCENT,
              marginTop: 18,
            }}
          >
            {copy.titleEn}
          </div>
          <div style={{ marginTop: 26, fontSize: 32, color: MUTED }}>{copy.tagline}</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
            {[copy.factPlayers, copy.factTime, copy.factAge].map((fact) => (
              <span
                key={fact}
                style={{
                  border: '1px solid #d9cbb6',
                  borderRadius: 999,
                  padding: '7px 16px',
                  fontSize: 16,
                  letterSpacing: '0.08em',
                  color: MUTED,
                }}
              >
                {fact}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 46 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {[0, 1, 2, 3, 4, 5].map((tile) => (
                <TileSvg key={tile} tile={tile} size={78} />
              ))}
            </div>
          </div>
          <div style={{ marginTop: 26, fontSize: 19, color: MUTED }}>{copy.endPrivacy}</div>
        </div>

        <div style={{ position: 'absolute', right: 110, top: 120, transform: 'rotate(7deg)' }}>
          <TileSvg tile={35} size={700} />
        </div>
        <div style={{ position: 'absolute', right: 620, top: 660, transform: 'rotate(-12deg)' }}>
          <TileSvg tile={18} size={220} />
        </div>
        <div style={{ position: 'absolute', right: 40, top: 760, transform: 'rotate(12deg)' }}>
          <TileSvg tile={21} size={210} />
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
}
