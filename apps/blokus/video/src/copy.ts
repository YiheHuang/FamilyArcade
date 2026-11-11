/**
 * Every on-screen string of the promo, in both languages.
 *
 * Single source of truth:
 * - scenes read it through `useCopy()` (language comes from the composition)
 * - the font subsetter reads it, so the woff2 files only carry these glyphs
 * - FACTS.md is generated against it
 */

export type Lang = "zh" | "en";

export interface Copy {
  s1: { brand: string; subtitle: string; tag: string };
  s2: {
    label: string;
    annotations: { contact: string; edge: string };
    steps: Array<{ no: string; key: string; lines: string[]; note: string }>;
  };
  s3: { label: string; title: string; sub: string; players: string[] };
  s4: {
    title: string;
    bonus: string;
    bonusText: string[];
    extra: string;
    extraText: string[];
    note: string;
    endNote: string;
  };
  s5: {
    label: string;
    title: string;
    /** language-specific UI stills, relative to public/ */
    shotsDir: string;
    cards: Array<{ title: string; lines: string[]; shot: string }>;
  };
  s6: { label: string; title: string; rows: Array<{ key: string; value: string }> };
  s7: { brand: string; subtitle: string; facts: string };
}

const ZH: Copy = {
  s1: {
    brand: "Blokus",
    subtitle: "角斗士棋",
    tag: "为家人做的桌面棋盘",
  },
  s2: {
    label: "规则，只要三句话",
    annotations: { contact: "对角相接", edge: "边贴边" },
    steps: [
      { no: "01", key: "起手", lines: ["第一块，", "盖住自己的角落。"], note: "" },
      { no: "02", key: "相接", lines: ["之后，每块都要和自己的", "棋子对角相接。"], note: "" },
      { no: "03", key: "边界", lines: ["不能边贴边。"], note: "贴着对手，可以。" },
    ],
  },
  s3: {
    label: "真实对局",
    title: "一局真实的棋。",
    sub: "四人同盘，一人一角。",
    players: ["蓝", "黄", "红", "绿"],
  },
  s4: {
    title: "分数，很简单。",
    bonus: "＋15",
    bonusText: ["放完全部", "21 块"],
    extra: "＋20",
    extraText: ["最后一块", "是单格块"],
    note: "每格 1 分",
    endNote: "放不下就跳过；所有人连续跳过后结算。",
  },
  s5: {
    label: "玩法",
    title: "三种玩法，一张桌子。",
    shotsDir: "shots/zh",
    cards: [
      { title: "单人训练", lines: ["与 AI 对弈，三档难度", "提示与悔棋"], shot: "setup.png" },
      { title: "本地对战", lines: ["2–4 人同屏轮流对弈"], shot: "game.png" },
      { title: "局域网对战", lines: ["浏览器也能加入", "手机扫码即入"], shot: "lobby.png" },
    ],
  },
  s6: {
    label: "细节",
    title: "小细节，不扫兴。",
    rows: [
      { key: "暂停", value: "房主一键，全桌停表" },
      { key: "观战", value: "第五台手机，只看不动" },
    ],
  },
  s7: {
    brand: "Blokus",
    subtitle: "角斗士棋",
    facts: "Windows 10/11 · 离线运行 · 无账号无广告",
  },
};

const EN: Copy = {
  s1: {
    brand: "Blokus",
    subtitle: "FOUR CORNERS",
    tag: "a board game for the family table",
  },
  s2: {
    label: "Three rules. That is it.",
    annotations: { contact: "corner to corner", edge: "edge to edge" },
    steps: [
      { no: "01", key: "Start", lines: ["Your first piece", "covers your corner."], note: "" },
      { no: "02", key: "Connect", lines: ["After that, connect", "corner to corner."], note: "" },
      { no: "03", key: "Edges", lines: ["Never edge to edge."], note: "Touching your opponents is fine." },
    ],
  },
  s3: {
    label: "A REAL GAME",
    title: "A real game.",
    sub: "Four players, one corner each.",
    players: ["Blue", "Yellow", "Red", "Green"],
  },
  s4: {
    title: "Scoring is simple.",
    bonus: "+15",
    bonusText: ["Place all", "21 pieces"],
    extra: "+20",
    extraText: ["Ending with", "the monomino"],
    note: "1 point per square",
    endNote: "No move? Pass — everyone passing ends the game.",
  },
  s5: {
    label: "MODES",
    title: "Three ways to play.",
    shotsDir: "shots/en",
    cards: [
      { title: "Solo practice", lines: ["Play the AI — three levels", "hints and undo"], shot: "setup.png" },
      { title: "Hot-seat", lines: ["2–4 players sharing one screen"], shot: "game.png" },
      { title: "LAN play", lines: ["Join from a browser", "phones scan a QR code"], shot: "lobby.png" },
    ],
  },
  s6: {
    label: "DETAILS",
    title: "The small things.",
    rows: [
      { key: "Pause", value: "the host stops the clock for everyone" },
      { key: "Spectate", value: "a fifth phone can just watch" },
    ],
  },
  s7: {
    brand: "Blokus",
    subtitle: "A FAMILY BOARD GAME",
    facts: "Windows 10/11 · offline · no accounts, no ads",
  },
};

export const COPY: Record<Lang, Copy> = { zh: ZH, en: EN };

/** characters a language's subset must cover (ASCII + its own glyphs) */
export function requiredChars(lang: Lang): string {
  const all = JSON.stringify(COPY[lang]);
  const chars = new Set<string>();
  for (const ch of all) {
    if ('"{}[]:,'.includes(ch)) continue;
    chars.add(ch);
  }
  for (const ch of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:/.·–—×＋+% ") {
    chars.add(ch);
  }
  return [...chars].join("");
}

/** union of both languages: one pair of font files serves both cuts */
export function allChars(): string {
  return [...new Set([...requiredChars("zh"), ...requiredChars("en")])].join("");
}
