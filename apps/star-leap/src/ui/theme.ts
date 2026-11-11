export type Mark = 'dot' | 'plus' | 'ring' | 'slash';

export interface SeatTheme {
  color: string;
  deep: string;
  light: string;
  mark: Mark;
  zh: string;
  en: string;
}

/** Four player colours, with a non-colour mark for each. */
export const SEAT_THEME: SeatTheme[] = [
  { color: '#4e6e9e', deep: '#2f4a70', light: '#9db6d6', mark: 'dot', zh: '蓝', en: 'Blue' },
  { color: '#c9a24b', deep: '#8d6a24', light: '#e8ca8a', mark: 'plus', zh: '金', en: 'Gold' },
  { color: '#b0604a', deep: '#7c3d2f', light: '#dda08e', mark: 'ring', zh: '珊瑚', en: 'Coral' },
  { color: '#6f9273', deep: '#47634b', light: '#a9c4ab', mark: 'slash', zh: '鼠尾草', en: 'Sage' },
];

export function seatTheme(seat: number): SeatTheme {
  return SEAT_THEME[seat % SEAT_THEME.length];
}

export function seatLabel(seat: number, lang: 'zh' | 'en'): string {
  const t = seatTheme(seat);
  return lang === 'zh' ? t.zh : t.en;
}
