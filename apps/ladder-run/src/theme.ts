import type { CSSProperties } from 'react';
import type { Lang } from './i18n';

export interface SeatTheme {
  seat: number;
  en: string;
  zh: string;
  color: string;
  deep: string;
  soft: string;
  ink: string;
}

export const SEATS: readonly SeatTheme[] = [
  { seat: 0, en: 'Coral', zh: '珊瑚', color: '#d05f45', deep: '#9e3f2c', soft: '#f7ded4', ink: '#fffaf5' },
  { seat: 1, en: 'Teal', zh: '青绿', color: '#3f8b7c', deep: '#2a665a', soft: '#d9ece6', ink: '#fffaf5' },
  { seat: 2, en: 'Gold', zh: '金黄', color: '#c7942f', deep: '#8e6715', soft: '#f5e8c9', ink: '#fffaf5' },
  { seat: 3, en: 'Plum', zh: '梅紫', color: '#8a5b86', deep: '#62405f', soft: '#ecdeea', ink: '#fffaf5' },
];

export function seatTheme(seat: number): SeatTheme {
  return SEATS[seat] ?? SEATS[0];
}

export function seatName(seat: number, lang: Lang): string {
  const theme = seatTheme(seat);
  return lang === 'zh' ? theme.zh : theme.en;
}

export function seatNameWithSuffix(seat: number, lang: Lang): string {
  const theme = seatTheme(seat);
  return lang === 'zh' ? `${theme.zh}色` : theme.en;
}

export function cssSeatVars(seat: number): CSSProperties {
  const theme = seatTheme(seat);
  return {
    '--seat-color': theme.color,
    '--seat-deep': theme.deep,
    '--seat-soft': theme.soft,
    '--seat-ink': theme.ink,
  } as CSSProperties;
}
