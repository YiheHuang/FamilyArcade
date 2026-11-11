import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { FadeUp } from "../anim";
import { GemIcon } from "../board/Gem";
import { PlayerPanel } from "../board/PlayerPanel";
import { TokenBank } from "../board/TokenBank";
import { GAME } from "../data";
import { FONT_SANS } from "../fonts";
import { useCopy } from "../lang";
import { ACCENT, ACCENT_100, ACCENT_700, INK_400, INK_500, PAPER, PAPER_200 } from "../theme";
import type { Color, TokenColor, Tokens } from "../types";

const BANK = { x: 520, y: 520, size: 118, gap: 18 };
const ORDER: TokenColor[] = ["white", "blue", "green", "red", "black", "gold"];

const pileCenter = (color: TokenColor): { x: number; y: number } => {
  const i = ORDER.indexOf(color);
  return {
    x: BANK.x + i * (BANK.size + BANK.gap) + BANK.size / 2,
    y: BANK.y + BANK.size / 2,
  };
};

/** one turn, one action: three gems lift out of the bank and land in the panel */
export const S4Take: React.FC = () => {
  const copy = useCopy();
  const frame = useCurrentFrame();
  const demo = GAME.take;
  const before = demo.before;
  const after = demo.after;
  const seat = demo.seat;
  const player = before.players[seat]!;
  const taken = (["white", "blue", "green", "red", "black"] as const).filter(
    (c) => (demo.taken?.[c] ?? 0) > 0,
  );
  const tokenIndex: Record<string, number> = {
    white: 0,
    blue: 1,
    green: 2,
    red: 3,
    black: 4,
    gold: 5,
  };

  const bankCounts: Tokens = { ...before.bank };
  const playerTokens: Tokens = { ...player.tokens };
  for (const color of taken) {
    const t = interpolate(frame, [62, 84], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    bankCounts[color] = before.bank[color] - (after.bank[color] < before.bank[color] ? 1 : 0) * t;
    playerTokens[color] = player.tokens[color] + (after.players[seat]!.tokens[color] - player.tokens[color]) * t;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Backdrop opacity={0.04} fadeIn={24} />

      <div style={{ position: "absolute", left: 96, top: 100, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 34, height: 2, background: ACCENT }} />
        <span style={{ fontFamily: FONT_SANS, fontSize: 25, fontWeight: 500, letterSpacing: "0.16em", color: INK_500 }}>
          {copy.s4.label}
        </span>
      </div>

      <FadeUp delay={4} duration={22} distance={16} style={{ position: "absolute", left: 96, top: 172 }}>
        <PlayerPanel
          player={player}
          copy={copy}
          width={820}
          focus
          tokensOverride={playerTokens}
          pointsOverride={before.players[seat]!.points}
        />
      </FadeUp>

      {/* the action chips: this turn, one of three */}
      <div style={{ position: "absolute", left: 1468, top: 208, display: "flex", flexDirection: "column", gap: 14 }}>
        {copy.s4.actions.map((action, i) => (
          <FadeUp key={action} delay={10 + i * 8} duration={20} distance={12}>
            <div
              style={{
                width: 300,
                height: 62,
                borderRadius: 16,
                background: i === 0 ? ACCENT_100 : "#fff",
                border: `${i === 0 ? 2 : 1}px solid ${i === 0 ? ACCENT : PAPER_200}`,
                color: i === 0 ? ACCENT_700 : INK_400,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "0 20px",
                boxSizing: "border-box",
                fontFamily: FONT_SANS,
                fontSize: 23,
                fontWeight: 500,
                boxShadow: i === 0 ? "0 12px 26px -20px rgba(201,147,46,0.6)" : "none",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: i === 0 ? ACCENT : PAPER_200,
                }}
              />
              {action}
            </div>
          </FadeUp>
        ))}
      </div>

      {/* the bank */}
      <FadeUp delay={8} duration={24} distance={20} style={{ position: "absolute", left: BANK.x, top: BANK.y }}>
        <TokenBank counts={bankCounts} size={BANK.size} gap={BANK.gap} labels copy={copy} highlight={taken} />
      </FadeUp>

      <div
        style={{
          position: "absolute",
          left: BANK.x,
          top: 710,
          width: BANK.size * 6 + BANK.gap * 5,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontFamily: FONT_SANS, fontSize: 26, fontWeight: 500, color: INK_500, letterSpacing: "0.01em" }}>
          {copy.s4.caption}
        </span>
        <span style={{ fontFamily: FONT_SANS, fontSize: 19, color: INK_400, letterSpacing: "0.06em" }}>
          {copy.s4.hint}
        </span>
      </div>

      {/* the gems themselves, in flight */}
      {taken.map((color, i) => {
        const start = pileCenter(color);
        const targetX = 340 + (tokenIndex[color] ?? 0) * 52 + 18;
        const targetY = 214;
        const t = interpolate(frame, [36 + i * 6, 66 + i * 6], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        if (t <= 0 || t >= 1) return null;
        const x = start.x + (targetX - start.x) * t;
        const y = start.y + (targetY - start.y) * t - Math.sin(Math.PI * t) * 96;
        const opacity = interpolate(t, [0, 0.1, 0.82, 1], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={color}
            style={{
              position: "absolute",
              left: x,
              top: y,
              translate: "-50% -50%",
              opacity,
              scale: 1.5 - 0.55 * t,
              filter: "drop-shadow(0 12px 16px rgba(38,48,62,0.28))",
            }}
          >
            <GemIcon color={color} size={58} />
          </div>
        );
      })}

      {/* a small emphasis on the three that arrived */}
      <div
        style={{
          position: "absolute",
          left: 300,
          top: 160,
          opacity: interpolate(frame, [78, 94, 150, 170], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 36,
            padding: "0 14px",
            borderRadius: 999,
            background: "#fff",
            border: `1px solid ${PAPER_200}`,
            color: INK_500,
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: "0.04em",
          }}
        >
          {taken.map((c) => (
            <GemIcon key={c} color={c as Color} size={18} />
          ))}
          +3
        </span>
      </div>
    </AbsoluteFill>
  );
};
