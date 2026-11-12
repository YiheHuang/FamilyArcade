import { rankOf, suitOf, type Card, type Meld } from './game/rummy-500';
import type { Lang } from './i18n';
import type { FamilyRecord, RecordMode } from './storage';

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
const SUIT_EN = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' } as const;
const SUIT_ZH = { S: '黑桃', H: '红桃', D: '方块', C: '梅花' } as const;

export function rankText(card: Card): string {
  const rank = rankOf(card);
  return rank === 'T' ? '10' : rank;
}

export function suitSymbol(card: Card): string {
  return SUIT_SYMBOL[suitOf(card)];
}

export function cardFace(card: Card): string {
  return `${rankText(card)}${suitSymbol(card)}`;
}

export function cardName(card: Card, lang: Lang): string {
  if (lang === 'zh') return `${SUIT_ZH[suitOf(card)]}${rankText(card)}`;
  return `${rankText(card)} of ${SUIT_EN[suitOf(card)]}`;
}

export function meldLabel(meld: Meld, lang: Lang): string {
  if (meld.kind === 'set') {
    const rank = meld.rank === 'T' ? '10' : meld.rank ?? '';
    return lang === 'zh' ? `${rank} 套牌` : `set of ${rank}s`;
  }
  const suit = meld.suit ? SUIT_EN[meld.suit] : '';
  return lang === 'zh' ? `${meld.suit ? SUIT_ZH[meld.suit] : ''}顺子` : `${suit} run`;
}

export function seatName(
  names: string[],
  seat: number,
  mode: 'ai' | 'local' | 'lan-host' | 'lan-guest',
  viewerSeat: number,
  t: (key: 'you' | 'aiN' | 'playerN' | 'guest' | 'host', params?: Record<string, string | number>) => string,
): string {
  const custom = names[seat]?.trim();
  if (custom) return custom;
  if (mode === 'ai') {
    if (seat === viewerSeat) return t('you');
    return t('aiN', { n: seat });
  }
  if (mode === 'local') return t('playerN', { n: seat + 1 });
  if (seat === viewerSeat) return t('you');
  if (seat === 0) return t('host');
  return t('guest');
}

export function modeLabel(mode: RecordMode, lang: Lang): string {
  if (mode === 'ai') return lang === 'zh' ? '单人' : 'Solo';
  if (mode === 'local') return lang === 'zh' ? '同屏' : 'Pass and play';
  return lang === 'zh' ? '局域网' : 'LAN';
}

export function recordRate(record: FamilyRecord): number {
  if (record.games === 0) return 0;
  return Math.round((record.byMode.lan / record.games) * 100);
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
