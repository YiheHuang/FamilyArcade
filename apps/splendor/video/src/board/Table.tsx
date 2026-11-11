import type { CSSProperties } from "react";
import type { Copy } from "../copy";
import { cardOf, nobleOf } from "../data";
import { FONT_SERIF } from "../fonts";
import { ACCENT_300, H, INK, INK_400, PAPER_50, PAPER_300, W } from "../theme";
import { Card } from "./Card";
import { NobleTile } from "./Noble";
import { PlayerPanel } from "./PlayerPanel";
import { TokenBank } from "./TokenBank";
import type { StateSnap } from "../types";

const CARD_W = 128;
const CARD_H = CARD_W * 1.375;
const GAP = 12;
const BOARD_X = 640;
const BOARD_Y = 192;
const BOARD_W = 640;
const BOARD_H = 612;
const CARD_X = 704;
const ROW_Y = [214, 402, 590];
const TIER_ROWS = [2, 1, 0] as const;
const ROMAN = ["III", "II", "I"] as const;

const PANEL_W = 420;
const PANEL_H = 104;

/** the whole table at 1920×1080: nobles, three card rows, bank, four seats */
export const Table: React.FC<{
  state: StateSnap;
  copy: Copy;
  lang: "zh" | "en";
  focus?: number;
  showPlayers?: boolean;
  opacity?: number;
  blur?: number;
  scale?: number;
  x?: number;
  y?: number;
  style?: CSSProperties;
}> = ({
  state,
  copy,
  lang,
  focus = state.current,
  showPlayers = true,
  opacity = 1,
  blur = 0,
  scale = 1,
  x = 0,
  y = 0,
  style,
}) => {
  const n = state.players.length;
  const panelGap = 16;
  const totalW = n * PANEL_W + (n - 1) * panelGap;
  const firstX = (W - totalW) / 2;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: W,
        height: H,
        scale,
        transformOrigin: "0 0",
        opacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        ...style,
      }}
    >
      {showPlayers &&
        state.players.map((player, i) => (
          <div
            key={player.seat}
            style={{
              position: "absolute",
              left: firstX + i * (PANEL_W + panelGap),
              top: 52,
              width: PANEL_W,
              height: PANEL_H,
            }}
          >
            <PlayerPanel
              player={player}
              copy={copy}
              compact
              width={PANEL_W}
              focus={player.seat === focus}
              dim={focus >= 0 && player.seat !== focus ? 0.35 : 0}
            />
          </div>
        ))}

      {/* nobles */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 170,
          width: 440,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 12,
            letterSpacing: "0.18em",
            color: INK_400,
            fontWeight: 500,
            marginBottom: 4,
          }}
        >
          {copy.table.nobles}
        </span>
        {state.nobles.map((id) => (
          <NobleTile key={id} noble={nobleOf(id)} size={80} />
        ))}
      </div>

      {/* board surface */}
      <div
        style={{
          position: "absolute",
          left: BOARD_X,
          top: BOARD_Y,
          width: BOARD_W,
          height: BOARD_H,
          borderRadius: 22,
          background: "#fff",
          border: `1px solid ${PAPER_300}`,
          boxShadow: "0 22px 50px -40px rgba(38,48,62,0.35)",
        }}
      >
        {TIER_ROWS.map((tier, row) => (
          <div key={tier}>
            <div
              style={{
                position: "absolute",
                left: 10,
                top: ROW_Y[row]! - BOARD_Y + 44,
                width: 46,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
              }}
            >
              <span
                style={{
                  fontFamily: FONT_SERIF,
                  fontSize: 21,
                  fontWeight: 600,
                  color: INK,
                  letterSpacing: "0.04em",
                }}
              >
                {ROMAN[row]}
              </span>
              <span style={{ fontSize: 10, color: INK_400, whiteSpace: "nowrap" }}>
                {lang === "zh"
                  ? `${copy.table.left} ${state.deckCounts[tier] ?? 0}`
                  : `${state.deckCounts[tier] ?? 0} ${copy.table.left}`}
              </span>
            </div>
            {[0, 1, 2, 3].map((slot) => {
              const id = state.board[tier]?.[slot] ?? null;
              return (
                <div
                  key={slot}
                  style={{
                    position: "absolute",
                    left: CARD_X - BOARD_X + slot * (CARD_W + GAP),
                    top: ROW_Y[row]! - BOARD_Y,
                  }}
                >
                  {id == null ? (
                    <div
                      style={{
                        width: CARD_W,
                        height: CARD_H,
                        borderRadius: 12,
                        border: `1.5px dashed ${PAPER_300}`,
                        background: PAPER_50,
                        boxSizing: "border-box",
                      }}
                    />
                  ) : (
                    <Card card={cardOf(id)} w={CARD_W} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* the shared bank */}
      <div style={{ position: "absolute", left: 696, top: 824 }}>
        <TokenBank counts={state.bank} size={78} />
      </div>

      {/* a whisper of an amber corner line, like the app's focus ring */}
      <div
        style={{
          position: "absolute",
          left: BOARD_X - 8,
          top: BOARD_Y - 8,
          width: BOARD_W + 16,
          height: BOARD_H + 16,
          borderRadius: 28,
          border: `1px solid ${ACCENT_300}`,
          opacity: 0.35,
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
