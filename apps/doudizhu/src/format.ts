import type { Card, ComboKind, RoundResult } from './game/doudizhu';
import type { AiLevel } from './ai/ai';
import type { Lang } from './i18n';

const SUIT_SYMBOL = { S: '♠', H: '♥', C: '♣', D: '♦', J: '' } as const;
const SUIT_EN = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds', J: '' } as const;
const SUIT_ZH = { S: '黑桃', H: '红桃', C: '梅花', D: '方块', J: '' } as const;

export function rankText(rank: number): string {
  if (rank >= 3 && rank <= 10) return String(rank);
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  if (rank === 15) return '2';
  if (rank === 16) return 'SJ';
  return 'BJ';
}

export function rankName(rank: number, lang: Lang): string {
  if (rank === 16) return lang === 'zh' ? '小王' : 'Small Joker';
  if (rank === 17) return lang === 'zh' ? '大王' : 'Big Joker';
  return rankText(rank);
}

export function suitSymbol(card: Card): string {
  return SUIT_SYMBOL[card.suit];
}

export function cardFace(card: Card): string {
  if (card.rank >= 16) return card.rank === 16 ? 'SJ' : 'BJ';
  return `${rankText(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

export function cardName(card: Card, lang: Lang): string {
  if (card.rank >= 16) return rankName(card.rank, lang);
  return lang === 'zh'
    ? `${SUIT_ZH[card.suit]}${rankText(card.rank)}`
    : `${rankText(card.rank)} of ${SUIT_EN[card.suit]}`;
}

export function comboName(kind: ComboKind, lang: Lang): string {
  const names: Record<ComboKind, [string, string]> = {
    single: ['Single', '单张'],
    pair: ['Pair', '对子'],
    triple: ['Triple', '三张'],
    'triple-single': ['Triple + single', '三带一'],
    'triple-pair': ['Triple + pair', '三带二'],
    straight: ['Straight', '顺子'],
    pairs: ['Consecutive pairs', '连对'],
    airplane: ['Airplane', '飞机'],
    'airplane-single': ['Airplane + singles', '飞机带单'],
    'airplane-pair': ['Airplane + pairs', '飞机带对'],
    'four-two': ['Four + two', '四带二'],
    'four-two-pairs': ['Four + two pairs', '四带两对'],
    bomb: ['Bomb', '炸弹'],
    rocket: ['Rocket', '王炸'],
  };
  return names[kind][lang === 'zh' ? 1 : 0];
}

export function sideName(side: RoundResult['winnerSide'], lang: Lang): string {
  if (side === 'landlord') return lang === 'zh' ? '地主' : 'Landlord';
  return lang === 'zh' ? '农民' : 'Farmers';
}

export function roleName(landlord: boolean, lang: Lang): string {
  if (landlord) return lang === 'zh' ? '地主' : 'Landlord';
  return lang === 'zh' ? '农民' : 'Farmer';
}

export function levelName(level: AiLevel, lang: Lang): string {
  const names: Record<AiLevel, [string, string]> = {
    companion: ['Companion', '陪玩'],
    easy: ['Easy', '轻松'],
    normal: ['Normal', '标准'],
    hard: ['Hard', '挑战'],
  };
  return names[level][lang === 'zh' ? 1 : 0];
}

export function modeName(mode: 'ai' | 'local' | 'lan-host' | 'lan-guest', lang: Lang): string {
  if (mode === 'ai') return lang === 'zh' ? '单人' : 'Solo';
  if (mode === 'local') return lang === 'zh' ? '同屏' : 'Hot-seat';
  return lang === 'zh' ? '局域网' : 'LAN';
}

export function formatDate(at: number, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(at));
  } catch {
    return '';
  }
}
