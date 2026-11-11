export interface VideoLine {
  at: number;
  en: string;
  zh: string;
  enFile?: string;
  zhFile?: string;
  enDuration?: number;
  zhDuration?: number;
}

export interface VideoGame {
  slug: string;
  order: number;
  title: string;
  titleZh: string;
  tagline: string;
  taglineZh: string;
  players: string;
  playersZh: string;
  time: string;
  timeZh: string;
  age: string;
  accent: string;
  paper: string;
  ink: string;
  screens: { en: string[]; zh: string[] };
  facts: string[];
  factsZh: string[];
  lines: VideoLine[];
}

export const FPS = 60;
export const SECONDS = 45;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export function ui(lang: 'en' | 'zh') {
  return lang === 'zh'
    ? {
        eyebrow: 'FAMILY ARCADE · 家庭游戏馆',
        solo: '单人 AI',
        hotseat: '同屏热座',
        lan: '局域网之夜',
        lanBody: '手机浏览器扫码加入，无需安装。',
        soloBody: '四档 AI，从温和陪玩到挑战。',
        hotseatBody: '一台设备，一家人轮流。',
        details: '小细节，不扫兴。',
        autosave: '自动保存',
        undo: '悔棋 + 提示',
        bilingual: '中英双语',
        privacy: '离线 · 无账号 · 无广告',
        collection: '27 款家庭游戏',
        watch: '真实游戏画面',
      }
    : {
        eyebrow: 'FAMILY ARCADE · FAMILY GAMES',
        solo: 'Solo vs AI',
        hotseat: 'Hot-seat',
        lan: 'LAN night',
        lanBody: 'Scan the code; phones join in a browser.',
        soloBody: 'AI levels, from gentle to hard.',
        hotseatBody: 'One screen, passed around the table.',
        details: 'The small things.',
        autosave: 'Autosave',
        undo: 'Undo + hints',
        bilingual: 'Chinese + English',
        privacy: 'Offline · no account · no ads',
        collection: '27 family games',
        watch: 'Real game footage',
      };
}
