import type { ReactNode } from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { DESSERTS, MiniCard, MiniDessert, SceneFade, ScreenshotFrame, Chip } from '../components/Visuals';
import { ACCENT, CARD, GOLD, INK, LINE, MUTED, SERIF } from '../theme';

function RuleCard({
  index,
  title,
  body,
  children,
}: {
  index: number;
  title: string;
  body: string;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: Math.max(0, frame - index * 14), fps, config: { damping: 200, mass: 0.8 } });
  return (
    <div
      style={{
        width: 500,
        height: 470,
        borderRadius: 26,
        background: CARD,
        border: `1px solid ${LINE}`,
        boxShadow: '0 24px 54px rgba(63,47,28,.10)',
        padding: '30px 32px 24px',
        display: 'flex',
        flexDirection: 'column',
        opacity: enter,
        translate: `0 ${(1 - enter) * 34}px`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Consolas, monospace', fontSize: 18, color: ACCENT }}>0{index}</span>
        <span style={{ fontSize: 14, letterSpacing: '0.16em', color: MUTED, textTransform: 'uppercase' }}>
          {index === 1 ? 'PICK' : index === 2 ? 'SCORE' : 'PASS'}
        </span>
      </div>
      <h3 style={{ fontFamily: SERIF, fontSize: 46, margin: '16px 0 0', fontWeight: 600, color: INK }}>{title}</h3>
      <p style={{ fontSize: 22, lineHeight: 1.5, color: MUTED, marginTop: 8 }}>{body}</p>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 0, marginTop: 10 }}>{children}</div>
    </div>
  );
}

export function Rules({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  return (
    <SceneFade>
      <AbsoluteFill>
        <div style={{ position: 'absolute', left: 120, top: 68, width: 980 }}>
          <div style={{ fontSize: 17, letterSpacing: '0.28em', color: ACCENT, textTransform: 'uppercase' }}>
            {lang === 'zh' ? '五句话里的三句' : 'THREE OF THE FIVE SENTENCES'}
          </div>
          <h2 style={{ fontFamily: SERIF, fontSize: 76, letterSpacing: '-0.04em', margin: '12px 0 0', color: INK }}>
            {copy.rulesTitle}
          </h2>
        </div>
        <div style={{ position: 'absolute', right: 80, top: 58, opacity: 0.96 }}>
          <ScreenshotFrame src={`screens/${lang}/rules.png`} width={420} height={292} rotate={2} alt="Rules and scoring table" />
        </div>

        <div style={{ position: 'absolute', left: 120, top: 360, display: 'flex', gap: 40 }}>
          <RuleCard index={1} title={copy.rule1} body={copy.rule1Body}>
            <div style={{ position: 'relative', width: 300, height: 180 }}>
              {DESSERTS.slice(0, 3).map((dessert, index) => (
                <div
                  key={dessert.id}
                  style={{
                    position: 'absolute',
                    left: 50 + index * 62,
                    top: 10 + Math.abs(index - 1) * 12,
                    zIndex: 3 - Math.abs(index - 1),
                  }}
                >
                  <MiniCard dessert={dessert} name={lang === 'zh' ? dessert.zh : dessert.en} width={105} rotate={(index - 1) * 8} />
                </div>
              ))}
            </div>
          </RuleCard>

          <RuleCard index={2} title={copy.rule2} body={copy.rule2Body}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              {[
                { dessert: DESSERTS[0], label: lang === 'zh' ? '一对' : 'Pair', value: '2' },
                { dessert: DESSERTS[2], label: lang === 'zh' ? '三层' : 'Triple', value: '6' },
                { dessert: DESSERTS[4], label: lang === 'zh' ? '拼盘' : 'Sampler', value: '5' },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: `1px solid ${LINE}`,
                    borderRadius: 14,
                    background: '#fbf4e7',
                    padding: '7px 12px',
                  }}
                >
                  <MiniDessert dessert={row.dessert} size={32} />
                  <span style={{ fontSize: 19, color: MUTED }}>{row.label}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: SERIF, fontSize: 28, color: ACCENT }}>{row.value}</span>
                </div>
              ))}
            </div>
          </RuleCard>

          <RuleCard index={3} title={copy.rule3} body={copy.rule3Body}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              {[
                { n: 1, dir: '↺', label: copy.passLeft },
                { n: 2, dir: '↻', label: copy.passRight },
                { n: 3, dir: '↺', label: copy.passLeft },
              ].map((row) => (
                <div
                  key={row.n}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    border: `1px solid ${LINE}`,
                    borderRadius: 999,
                    background: '#fbf4e7',
                    padding: '8px 16px',
                  }}
                >
                  <span style={{ fontFamily: 'Consolas, monospace', fontSize: 16, color: GOLD }}>0{row.n}</span>
                  <span style={{ fontSize: 25, color: ACCENT }}>{row.dir}</span>
                  <span style={{ fontSize: 18, letterSpacing: '0.08em', color: MUTED }}>{row.label}</span>
                </div>
              ))}
            </div>
          </RuleCard>
        </div>

        <div style={{ position: 'absolute', left: 120, bottom: 52, display: 'flex', gap: 12 }}>
          <Chip>{copy.cards72}</Chip>
          <Chip>{copy.facts}</Chip>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}
