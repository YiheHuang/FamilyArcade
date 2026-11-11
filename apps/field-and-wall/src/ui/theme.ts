import { SEATS } from '../game/types';

export const seatTheme = (seat: number) =>
  SEATS[seat] ?? { zh: '青蓝', en: 'Blue', color: '#47657f', deep: '#2d4458', mark: 'dot' };

export const palette = {
  paper: '#f4efe2',
  paper2: '#ece4d3',
  ink: '#2b332b',
  ink2: '#414a3d',
  muted: '#7c7668',
  line: '#d8cebb',
  lineStrong: '#c2b49a',
  moss: '#647450',
  mossDeep: '#4b5a3a',
  gold: '#b98f46',
  goldDeep: '#8f6a30',
  field: '#c6d296',
  fieldLight: '#d9e2ae',
  fieldDark: '#9fad6e',
  city: '#d3b98f',
  cityLight: '#e8d5ad',
  cityDark: '#a98a61',
  wall: '#6b5439',
  wallDark: '#4e3d29',
  roof: '#a35740',
  roofDark: '#713827',
  road: '#dcc394',
  roadEdge: '#94784e',
  roadDash: '#f8ecd2',
  tree: '#6c8049',
  treeDark: '#526438',
  treeLight: '#8b9d63',
  trunk: '#6d553a',
  monastery: '#e6d5b2',
  shadow: 'rgba(52, 43, 28, 0.26)',
};
