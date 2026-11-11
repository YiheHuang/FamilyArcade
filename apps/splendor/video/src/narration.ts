/**
 * The ten narration lines and their start times.
 *
 * Single source of truth: `scripts/gen-voice.ts` measures each generated line
 * with ffprobe and writes `src/data/narration.{zh,en}.json`; the subtitles, the
 * mix and the FACTS report all read those measured files. Start times are on
 * scene boundaries, not on words, so re-generating a voice cannot shift a cut.
 */
export type NarrationLine = { at: number; text: string };

export const FILM_SECONDS = 54;

export const NARRATION: Record<"zh" | "en", NarrationLine[]> = {
  zh: [
    { at: 0.65, text: "周末，四个人，一桌宝石。" },
    { at: 4.7, text: "璀璨宝石，家庭版。" },
    { at: 7.85, text: "规则很简单：拿宝石，买卡，先到十五分，打完最后一轮。" },
    { at: 15.2, text: "每回合选一件事：拿宝石、买卡，或者预留。" },
    { at: 21.4, text: "买下的卡会变成永久折扣，也会带来分数。" },
    { at: 30.3, text: "凑齐贵族要的折扣，他会亲自到访，再加三分。" },
    { at: 36.2, text: "四个人同屏；也可以各自用手机加入。" },
    { at: 40.55, text: "局域网内，扫码入座，手机不用装。" },
    { at: 45.35, text: "四档 AI，节奏更慢，走错了还能悔一步。" },
    { at: 50.6, text: "今晚，来一局。" },
  ],
  en: [
    { at: 0.8, text: "Weekend. Four people. One table of gems." },
    { at: 4.9, text: "Splendor — the family edition." },
    {
      at: 7.9,
      text: "The rules are simple: take gems, buy cards, reach fifteen points, then finish the round.",
    },
    { at: 15.4, text: "On your turn, do one thing: take gems, buy a card, or reserve one." },
    { at: 21.4, text: "Every card you buy is a permanent discount — and points." },
    { at: 30.3, text: "Match a noble's bonuses and they visit you for three more points." },
    { at: 36.3, text: "Four players on one screen — or everyone joins from a phone." },
    { at: 40.7, text: "On your own network, scan and sit down. Nothing to install." },
    { at: 45.3, text: "Four AI levels, a slower pace, and an undo for the odd mistake." },
    { at: 50.6, text: "One more game tonight." },
  ],
};
