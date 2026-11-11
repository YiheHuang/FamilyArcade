import rawCourse from '../../data/course.json';

export type BalloonPattern = 'stripes' | 'dots' | 'zigzag' | 'rings' | 'diamonds';

export interface Balloon {
  id: string;
  nameEn: string;
  nameZh: string;
  color: string;
  light: string;
  pattern: BalloonPattern;
}

export interface Course {
  version: number;
  source: string;
  count: number;
  trackLength: number;
  rounds: number;
  tailwindPerPlayer: number;
  startPositions: number[];
  windCards: number[];
  scoring: {
    roundLeader: number;
    roundSecond: number;
    overallLeader: number;
    unusedTailwind: number;
  };
  balloons: Balloon[];
}

export const COURSE = rawCourse as Course;

export const BALLOONS: readonly Balloon[] = COURSE.balloons;
export const BALLOON_COUNT = COURSE.balloons.length;
export const TRACK_LENGTH = COURSE.trackLength;
export const ROUNDS = COURSE.rounds;
export const WIND_CARDS: readonly number[] = COURSE.windCards;
export const SCORING = COURSE.scoring;
export const TAILWIND_PER_PLAYER = COURSE.tailwindPerPlayer;

/** Throws a readable error if the checked-in course data drifts. */
export function assertCourseData(course: Course = COURSE): void {
  if (course.version !== 1) throw new Error('course version must be 1');
  if (!course.source) throw new Error('course source is required');
  if (course.count !== 5) throw new Error('course count must be 5 balloons');
  if (course.balloons.length !== 5) throw new Error('exactly five balloons are required');
  if (course.trackLength !== 20) throw new Error('track length must be 20');
  if (course.rounds !== 4) throw new Error('the rally must have four rounds');
  if (course.tailwindPerPlayer !== 2) throw new Error('each player gets two tailwind tokens');
  if (course.startPositions.length !== course.balloons.length) {
    throw new Error('start position count must match balloons');
  }
  if (course.startPositions.some((p) => p !== 0)) throw new Error('all balloons start at 0');
  if (course.windCards.length !== 5) throw new Error('exactly five wind cards are required');
  if (course.windCards.some((v) => !Number.isInteger(v) || v < 1 || v > 3)) {
    throw new Error('wind cards must be integers from 1 to 3');
  }
  for (const value of [1, 2, 3]) {
    if (!course.windCards.includes(value)) throw new Error(`wind deck is missing a ${value}`);
  }
  const ids = new Set<string>();
  for (const balloon of course.balloons) {
    if (!balloon.id || ids.has(balloon.id)) throw new Error('balloon ids must be unique');
    ids.add(balloon.id);
    if (!balloon.nameEn || !balloon.nameZh) throw new Error('balloons need both names');
    if (!/^#[0-9a-f]{6}$/i.test(balloon.color)) throw new Error('balloon colours must be hex');
    if (!['stripes', 'dots', 'zigzag', 'rings', 'diamonds'].includes(balloon.pattern)) {
      throw new Error(`unknown balloon pattern: ${balloon.pattern}`);
    }
  }
  const s = course.scoring;
  if (s.roundLeader !== 3 || s.roundSecond !== 1 || s.overallLeader !== 5 || s.unusedTailwind !== 1) {
    throw new Error('scoring must be 3 / 1 / 5 / 1');
  }
}

assertCourseData();

export function balloonName(balloon: Balloon, lang: 'zh' | 'en'): string {
  return lang === 'zh' ? balloon.nameZh : balloon.nameEn;
}
