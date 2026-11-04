export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);

export const inverseLerp = (a: number, b: number, v: number) => (a === b ? 0 : clamp01((v - a) / (b - a)));

export const moveTowards = (current: number, target: number, maxStep: number) =>
  Math.abs(target - current) <= maxStep ? target : current + Math.sign(target - current) * maxStep;

/** Shortest signed turn from one heading to another, in radians. */
export function deltaAngle(from: number, to: number) {
  const turn = (to - from) % (Math.PI * 2);
  if (turn > Math.PI) return turn - Math.PI * 2;
  if (turn < -Math.PI) return turn + Math.PI * 2;
  return turn;
}
