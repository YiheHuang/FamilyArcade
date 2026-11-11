/**
 * Every on-screen string of the promo, in both languages.
 *
 * Single source of truth:
 * - scenes read it through `useCopy()` (the language comes from the composition)
 * - the font subsetter reads it (plus the narration), so the woff2 files only
 *   carry the glyphs this film actually uses
 * - FACTS.md is generated against it
 */
import { NARRATION } from "./narration";

export type Lang = "zh" | "en";

export interface Copy {
  players: string[];
  ai: { normal: string; friendly: string; easy: string; hard: string };
  seatTag: { human: string; ai: string };
  gems: Record<"white" | "blue" | "green" | "red" | "black" | "gold", string>;
  s2: { title: string; subtitle: string; spec: string };
  s3: {
    label: string;
    cards: Array<{ no: string; title: string; line: string }>;
    finalRound: string;
    note: string;
  };
  s4: { label: string; actions: string[]; caption: string; hint: string };
  s5: {
    label: string;
    cardLabel: string;
    cost: string;
    discount: string;
    pay: string;
    gold: string;
    score: string;
    bonus: string;
  };
  s6: { label: string; visit: string; plus: string; req: string };
  s7: { label: string; title: string; scan: string; joined: string; local: string; room: string };
  s8: { label: string; cards: Array<{ title: string; line: string; shot: string }> };
  s9: { title: string; family: string; tagline: string; facts: string };
  panel: { bonus: string; reserved: string };
  table: { nobles: string; gems: string; left: string };
}

const ZH: Copy = {
  players: ["爸爸", "妈妈", "哥哥", "妹妹"],
  ai: { normal: "普通", friendly: "陪玩", easy: "简单", hard: "困难" },
  seatTag: { human: "玩家", ai: "AI" },
  gems: {
    white: "钻石",
    blue: "蓝宝石",
    green: "祖母绿",
    red: "红宝石",
    black: "玛瑙",
    gold: "金币",
  },
  s2: {
    title: "Splendor",
    subtitle: "璀璨宝石 · 家庭版",
    spec: "2–4 人 · 90 张卡 · 10 位贵族",
  },
  s3: {
    label: "规则，三件事",
    cards: [
      { no: "01", title: "拿宝石", line: "三色各一，或同色两枚" },
      { no: "02", title: "买卡", line: "永久折扣，也带来分数" },
      { no: "03", title: "到 15 分", line: "打完最后一轮，分高者胜" },
    ],
    finalRound: "最后一轮",
    note: "官方规则 · 90 张发展卡 · 10 位贵族",
  },
  s4: {
    label: "拿宝石",
    actions: ["拿宝石", "买卡", "预留"],
    caption: "三色各一 · 同色两枚",
    hint: "每回合只做一件事",
  },
  s5: {
    label: "买卡",
    cardLabel: "发展卡",
    cost: "成本",
    discount: "折扣",
    pay: "支付",
    gold: "金币可当任意颜色",
    score: "声望",
    bonus: "永久加成",
  },
  s6: {
    label: "贵族",
    visit: "贵族到访",
    plus: "+3 分",
    req: "凑齐折扣",
  },
  s7: {
    label: "一起玩",
    title: "四个人同屏",
    scan: "扫码加入",
    joined: "已加入 · 游戏开始",
    local: "同一 Wi-Fi · 无需安装",
    room: "房间码",
  },
  s8: {
    label: "细节",
    cards: [
      { title: "四档 AI", line: "陪玩档不针对小朋友", shot: "ai.png" },
      { title: "更慢的节奏", line: "动画速度可调", shot: "settings.png" },
      { title: "每一步都可回看", line: "自动保存 · 复盘", shot: "replay.png" },
    ],
  },
  s9: {
    title: "Splendor",
    family: "家庭版",
    tagline: "三分钟学会，一家人刚刚好。",
    facts: "Windows 10/11 · 安装包 3.6 MB · 无需账号",
  },
  panel: { bonus: "加成", reserved: "预定" },
  table: { nobles: "贵族", gems: "宝石", left: "剩" },
};

const EN: Copy = {
  players: ["Dad", "Mom", "Mia", "Leo"],
  ai: { normal: "Normal", friendly: "Companion", easy: "Easy", hard: "Hard" },
  seatTag: { human: "PLAYER", ai: "AI" },
  gems: {
    white: "Diamond",
    blue: "Sapphire",
    green: "Emerald",
    red: "Ruby",
    black: "Onyx",
    gold: "Gold",
  },
  s2: {
    title: "Splendor",
    subtitle: "FAMILY EDITION",
    spec: "2–4 PLAYERS · 90 CARDS · 10 NOBLES",
  },
  s3: {
    label: "THREE THINGS",
    cards: [
      { no: "01", title: "Take gems", line: "Three different, or two of one" },
      { no: "02", title: "Buy a card", line: "A permanent discount — and points" },
      { no: "03", title: "Reach 15", line: "Finish the round; highest score wins" },
    ],
    finalRound: "FINAL ROUND",
    note: "OFFICIAL RULES · 90 DEVELOPMENT CARDS · 10 NOBLES",
  },
  s4: {
    label: "TAKE GEMS",
    actions: ["Take", "Buy", "Reserve"],
    caption: "3 different · 2 of one",
    hint: "One action per turn",
  },
  s5: {
    label: "BUY A CARD",
    cardLabel: "DEVELOPMENT CARD",
    cost: "COST",
    discount: "DISCOUNT",
    pay: "PAY",
    gold: "Gold is wild",
    score: "PRESTIGE",
    bonus: "PERMANENT BONUS",
  },
  s6: {
    label: "NOBLES",
    visit: "A NOBLE VISITS",
    plus: "+3 POINTS",
    req: "MATCH THE BONUSES",
  },
  s7: {
    label: "PLAY TOGETHER",
    title: "Four on one screen",
    scan: "SCAN TO JOIN",
    joined: "JOINED · GAME ON",
    local: "SAME WI-FI · NOTHING TO INSTALL",
    room: "ROOM CODE",
  },
  s8: {
    label: "DETAILS",
    cards: [
      { title: "Four AI levels", line: "Companion never targets kids", shot: "ai.png" },
      { title: "A slower pace", line: "Animation speed is adjustable", shot: "settings.png" },
      { title: "Every move kept", line: "Autosave · replay", shot: "replay.png" },
    ],
  },
  s9: {
    title: "Splendor",
    family: "FAMILY EDITION",
    tagline: "Three minutes to learn. One table for the family.",
    facts: "Windows 10/11 · 3.6 MB installer · No account",
  },
  panel: { bonus: "BONUS", reserved: "RESERVED" },
  table: { nobles: "NOBLES", gems: "GEMS", left: "left" },
};

export const COPY: Record<Lang, Copy> = { zh: ZH, en: EN };

/** every glyph used by the film (copy + subtitles), for the font subsetter */
export function allChars(): string {
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object")
      for (const key of Object.keys(value)) walk((value as Record<string, unknown>)[key]);
  };
  walk(COPY);
  walk(NARRATION);
  return [...new Set(strings.join(""))].join("");
}
