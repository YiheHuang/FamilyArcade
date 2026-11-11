import { Easing, interpolate } from 'remotion';

export function enter(frame: number, fps: number, delay: number, duration = 0.7): number {
  const start = delay * fps;
  return interpolate(frame, [start, start + duration * fps], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

export function fadeOut(frame: number, fps: number, start: number, duration = 0.5): number {
  return interpolate(frame, [start * fps, (start + duration) * fps], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
