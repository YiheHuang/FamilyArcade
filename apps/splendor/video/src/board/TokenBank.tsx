import type { Copy } from "../copy";
import { INK, INK_400, PAPER_300 } from "../theme";
import { GemIcon } from "./Gem";
import type { Tokens } from "../types";

const ORDER = ["white", "blue", "green", "red", "black", "gold"] as const;

/** the shared gem bank: six piles with counts, optionally labelled */
export const TokenBank: React.FC<{
  counts: Tokens;
  size?: number;
  gap?: number;
  labels?: boolean;
  copy?: Copy;
  highlight?: ReadonlyArray<(typeof ORDER)[number]>;
  style?: React.CSSProperties;
}> = ({ counts, size = 78, gap = 12, labels = false, copy, highlight = [], style }) => {
  return (
    <div style={{ display: "flex", gap, alignItems: "flex-start", ...style }}>
      {ORDER.map((color) => {
        const n = counts[color] ?? 0;
        const hot = highlight.includes(color);
        return (
          <div key={color} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.1 }}>
            <div
              style={{
                width: size,
                height: size,
                borderRadius: size * 0.18,
                background: "#fff",
                border: `1px solid ${PAPER_300}`,
                boxShadow: hot
                  ? "0 0 0 4px rgba(201,147,46,0.30), 0 10px 24px -14px rgba(38,48,62,0.35)"
                  : "0 4px 12px -8px rgba(38,48,62,0.20)",
                display: "grid",
                placeItems: "center",
                position: "relative",
                opacity: n === 0 ? 0.42 : 1,
                boxSizing: "border-box",
              }}
            >
              <GemIcon color={color} size={size * 0.44} />
              <span
                style={{
                  position: "absolute",
                  right: size * 0.12,
                  bottom: size * 0.08,
                  color: INK,
                  fontSize: size * 0.26,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
              >
                {n}
              </span>
            </div>
            {labels && copy ? (
              <span style={{ fontSize: size * 0.14, color: INK_400, fontWeight: 500, letterSpacing: "0.02em" }}>
                {copy.gems[color]}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
