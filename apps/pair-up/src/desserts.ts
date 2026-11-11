export interface Dessert {
  emoji: string;
  en: string;
  zh: string;
}

export interface DessertFace extends Dessert {
  name: string;
}

/** 18 desserts — enough for the 6×6 deck. Emoji only, no downloaded art. */
export const DESSERTS: readonly Dessert[] = [
  { emoji: '🍰', en: 'Cake', zh: '蛋糕' },
  { emoji: '🧁', en: 'Cupcake', zh: '纸杯蛋糕' },
  { emoji: '🍪', en: 'Cookie', zh: '曲奇' },
  { emoji: '🍩', en: 'Doughnut', zh: '甜甜圈' },
  { emoji: '🍫', en: 'Chocolate', zh: '巧克力' },
  { emoji: '🍬', en: 'Candy', zh: '糖果' },
  { emoji: '🍭', en: 'Lollipop', zh: '棒棒糖' },
  { emoji: '🍮', en: 'Custard', zh: '布丁' },
  { emoji: '🍯', en: 'Honey', zh: '蜂蜜' },
  { emoji: '🥧', en: 'Pie', zh: '派' },
  { emoji: '🍦', en: 'Ice cream', zh: '冰淇淋' },
  { emoji: '🍓', en: 'Strawberry', zh: '草莓' },
  { emoji: '🍒', en: 'Cherries', zh: '樱桃' },
  { emoji: '🍋', en: 'Lemon', zh: '柠檬' },
  { emoji: '🍑', en: 'Peach', zh: '桃子' },
  { emoji: '🥐', en: 'Croissant', zh: '可颂' },
  { emoji: '🍞', en: 'Bread', zh: '面包' },
  { emoji: '🧇', en: 'Waffle', zh: '华夫饼' },
];

export function dessert(value: number, lang: 'en' | 'zh'): DessertFace {
  const item = DESSERTS[value % DESSERTS.length] ?? DESSERTS[0];
  return { ...item, name: item[lang] };
}

export const PLAYER_COLORS = ['#b4472f', '#3f7a63', '#a9771f', '#486b9e', '#8a4f7d', '#5d6b2f'];
