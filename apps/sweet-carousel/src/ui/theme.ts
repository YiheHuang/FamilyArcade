export type Mark = 'dot' | 'plus' | 'ring' | 'slash' | 'star';

export interface SeatTheme {
  color: string;
  deep: string;
  light: string;
  mark: Mark;
  zh: string;
  en: string;
}

/** Five seat colours, each paired with a non-colour mark. */
export const SEAT_THEME: SeatTheme[] = [
  { color: '#b4634a', deep: '#763626', light: '#ecd0c5', mark: 'dot', zh: '陶红', en: 'Terracotta' },
  { color: '#4f7d72', deep: '#2e5149', light: '#c8ddd7', mark: 'plus', zh: '松绿', en: 'Pine' },
  { color: '#b08a3e', deep: '#6f531c', light: '#eadbb8', mark: 'ring', zh: '金盏', en: 'Marigold' },
  { color: '#7b5f91', deep: '#4a355d', light: '#dccfe7', mark: 'slash', zh: '梅紫', en: 'Plum' },
  { color: '#6d7f4e', deep: '#43502d', light: '#d5dec5', mark: 'star', zh: '橄榄', en: 'Olive' },
];

export function seatTheme(seat: number): SeatTheme {
  return SEAT_THEME[seat % SEAT_THEME.length];
}

export function seatLabel(seat: number, lang: 'zh' | 'en'): string {
  const theme = seatTheme(seat);
  return lang === 'zh' ? theme.zh : theme.en;
}
