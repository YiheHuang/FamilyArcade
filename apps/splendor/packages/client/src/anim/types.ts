import type { AnimStep } from './steps';
import type { Rect } from './rects';

/** 已解析坐标、可直接播放的一步动画 */
export type QueuedAnim = AnimStep & { from: Rect; to: Rect };

export type { AnimStep };
