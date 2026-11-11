export type Mark = 'dot' | 'plus' | 'ring' | 'slash' | 'double' | 'triangle';

export interface SeatTheme {
  color: string;
  deep: string;
  light: string;
  mark: Mark;
  zh: string;
  en: string;
}

/** Six seat colours, each paired with a non-colour mark. */
export const SEAT_THEME: SeatTheme[] = [
  { color: '#3f6b8c', deep: '#294a64', light: '#a9c4d8', mark: 'dot', zh: '湖蓝', en: 'Lake' },
  { color: '#a97b2d', deep: '#75521a', light: '#e4c88f', mark: 'plus', zh: '麦金', en: 'Wheat' },
  { color: '#a95340', deep: '#763729', light: '#e2b3a7', mark: 'ring', zh: '陶红', en: 'Clay' },
  { color: '#5d8164', deep: '#3f5c46', light: '#b3cbb6', mark: 'slash', zh: '苔绿', en: 'Moss' },
  { color: '#78619b', deep: '#524070', light: '#c8b9dd', mark: 'double', zh: '暮紫', en: 'Dusk' },
  { color: '#6c6a4f', deep: '#4b4935', light: '#c4c1a5', mark: 'triangle', zh: '橄榄', en: 'Olive' },
];

export function seatTheme(seat: number): SeatTheme {
  return SEAT_THEME[seat % SEAT_THEME.length];
}

export function seatLabel(seat: number, lang: 'zh' | 'en'): string {
  const theme = seatTheme(seat);
  return lang === 'zh' ? theme.zh : theme.en;
}
