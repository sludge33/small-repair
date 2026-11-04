import { deltaAngle } from './math';

export interface Point {
  x: number;
  y: number;
}

export interface TwoFingerDelta {
  /** Movement of the midpoint, in the same units as the points. */
  panX: number;
  panY: number;
  /** Spread now over spread before; above 1 is a pinch outwards. */
  scale: number;
  /** Turn of the line between the fingers, in radians. Positive is clockwise on screen, where y runs down. */
  twist: number;
}

/** What two fingers did between two samples. */
export function twoFingerDelta(a0: Point, b0: Point, a1: Point, b1: Point): TwoFingerDelta {
  const before = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const after = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  return {
    panX: (a1.x + b1.x - a0.x - b0.x) / 2,
    panY: (a1.y + b1.y - a0.y - b0.y) / 2,
    scale: before > 0 && after > 0 ? after / before : 1,
    twist: deltaAngle(Math.atan2(b0.y - a0.y, b0.x - a0.x), Math.atan2(b1.y - a1.y, b1.x - a1.x)),
  };
}
