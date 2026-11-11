import type { CSSProperties } from "react";
import type { Copy } from "../copy";
import { cardOf, nobleOf } from "../data";
import { ACCENT, INK, INK_400, INK_500, PAPER_100, PAPER_300 } from "../theme";
import { MiniCard } from "./Card";
import { GemIcon } from "./Gem";
import { NobleBadge } from "./Noble";
import type { Cost, PlayerSnap, Tokens } from "../types";

const GEM_ORDER = ["white", "blue", "green", "red", "black"] as const;
const TOKEN_ORDER = ["white", "blue", "green", "red", "black", "gold"] as const;

const Tag: React.FC<{ children: React.ReactNode; size: number }> = ({ children, size }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      height: size * 1.5,
      padding: `0 ${size * 0.7}px`,
      borderRadius: 999,
      background: PAPER_100,
      color: INK_500,
      fontSize: size,
      fontWeight: 500,
      letterSpacing: "0.02em",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

/** a player's seat card: name, score, tokens, permanent bonuses and tableau */
export const PlayerPanel: React.FC<{
  player: PlayerSnap;
  copy: Copy;
  width?: number;
  compact?: boolean;
  focus?: boolean;
  dim?: number;
  pointsOverride?: number;
  tokensOverride?: Tokens;
  bonusesOverride?: Cost;
  purchasedOverride?: number[];
  noblesOverride?: number[];
  style?: CSSProperties;
}> = ({
  player,
  copy,
  width = 820,
  compact = false,
  focus = false,
  dim = 0,
  pointsOverride,
  tokensOverride,
  bonusesOverride,
  purchasedOverride,
  noblesOverride,
  style,
}) => {
  const tokens = tokensOverride ?? player.tokens;
  const bonuses = bonusesOverride ?? player.bonuses;
  const purchased = purchasedOverride ?? player.purchased;
  const nobles = noblesOverride ?? player.nobles;
  const points = pointsOverride ?? player.points;
  const isAi = player.kind === "ai";
  const tag = isAi ? `${copy.seatTag.ai} · ${copy.ai[player.aiLevel]}` : copy.seatTag.human;
  const h = compact ? 104 : 170;
  const miniW = compact ? 16 : 26;
  const maxMinis = compact ? 1 : 7;
  const shown = purchased.slice(-maxMinis);
  const extra = purchased.length - shown.length;

  return (
    <div
      style={{
        width,
        height: h,
        borderRadius: compact ? 14 : 18,
        background: focus ? "#fffdf8" : "#fff",
        border: `${focus ? 2 : 1.5}px solid ${focus ? ACCENT : PAPER_300}`,
        boxShadow: focus
          ? "0 0 0 4px rgba(201,147,46,0.16), 0 18px 40px -26px rgba(38,48,62,0.35)"
          : "0 10px 26px -22px rgba(38,48,62,0.28)",
        padding: compact ? 14 : 22,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "stretch",
        gap: compact ? 12 : 22,
        opacity: 1 - dim,
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* identity + score */}
      <div style={{ width: compact ? 126 : 200, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 6 : 9, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: compact ? 19 : 30,
              fontWeight: 600,
              color: INK,
              lineHeight: 1.1,
              letterSpacing: "0.01em",
            }}
          >
            {copy.players[player.seat] ?? `P${player.seat + 1}`}
          </span>
          <Tag size={compact ? 9 : 13}>{tag}</Tag>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: compact ? 3 : 5,
            marginTop: compact ? 2 : 4,
          }}
        >
          <span
            style={{
              fontSize: compact ? 46 : 68,
              fontWeight: 600,
              color: INK,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            {points}
          </span>
          <span style={{ fontSize: compact ? 12 : 18, color: INK_400, fontWeight: 500 }}>
            {copy.s5.score}
          </span>
        </div>
      </div>

      {/* tokens + bonuses */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: compact ? 7 : 12, alignItems: "center", flexWrap: "wrap" }}>
          {TOKEN_ORDER.map((c) => (
            <span
              key={c}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: compact ? 3 : 5,
                color: tokens[c] > 0 ? INK : INK_400,
                fontSize: compact ? 13 : 20,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <GemIcon color={c} size={compact ? 15 : 24} />
              {tokens[c]}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: compact ? 7 : 12, alignItems: "center" }}>
          {!compact && (
            <span style={{ fontSize: 13, color: INK_400, fontWeight: 500, letterSpacing: "0.06em" }}>
              {copy.panel.bonus}
            </span>
          )}
          {GEM_ORDER.map((c) => (
            <span
              key={c}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: compact ? 2 : 4,
                color: bonuses[c] > 0 ? INK : INK_400,
                fontSize: compact ? 12 : 17,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <GemIcon color={c} size={compact ? 13 : 20} plain />
              {bonuses[c]}
            </span>
          ))}
        </div>
      </div>

      {/* tableau + nobles */}
      <div
        style={{
          width: compact ? 78 : 210,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 6 }}>
          {shown.map((id) => (
            <MiniCard key={id} card={cardOf(id)} w={miniW} />
          ))}
          {extra > 0 && (
            <span style={{ fontSize: compact ? 11 : 14, color: INK_400, fontWeight: 600 }}>
              +{extra}
            </span>
          )}
          {purchased.length === 0 && (
            <span style={{ fontSize: compact ? 10 : 13, color: INK_400 }}>—</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 3 : 5 }}>
          {player.reserved.length > 0 && (
            <span style={{ fontSize: compact ? 9 : 11, color: INK_400, letterSpacing: "0.04em" }}>
              {copy.panel.reserved} {player.reserved.length}
            </span>
          )}
          {nobles.slice(0, compact ? 1 : 3).map((id) => (
            <NobleBadge key={id} noble={nobleOf(id)} w={compact ? 15 : 22} />
          ))}
          {nobles.length > (compact ? 1 : 3) && (
            <span style={{ fontSize: compact ? 10 : 13, color: INK_400, fontWeight: 600 }}>
              +{nobles.length - (compact ? 1 : 3)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
