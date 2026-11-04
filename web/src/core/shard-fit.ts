import { inverseLerp } from './math';

export const defaultFitParams = {
  /** Spec: a shard within 3 mm and 4° snaps. */
  snapDistanceMm: 3,
  snapAngleDeg: 4,
  /** Spec: within 1 mm and 1° before the snap counts as clean. */
  cleanDistanceMm: 1,
  cleanAngleDeg: 1,
  /** The magnet starts pulling at this distance from the shard's seat. */
  magnetFromMm: 22,
  /** The finger is this close when the magnet has taken over completely. */
  magnetFullMm: 7,
};

export type FitParams = typeof defaultFitParams;

export interface ShardFit {
  /** 0 = the shard follows the finger, 1 = the magnet holds it in its seat. */
  pull: number;
  /** Where the shard actually sits once the magnet has pulled it. */
  distanceMm: number;
  angleDeg: number;
  snaps: boolean;
  /** Whether the finger itself was this close, before any help from the magnet. */
  clean: boolean;
}

/**
 * Judges a held shard. The magnet closes both errors together, so a thumb that never twists a shard still seats
 * it; lining it up by hand is what earns the clean band.
 * @param distanceMm Finger-held position to the seat.
 * @param angleDeg Finger-held rotation away from the seat, unsigned.
 */
export function judgeFit(distanceMm: number, angleDeg: number, params: FitParams = defaultFitParams): ShardFit {
  const pull = 1 - inverseLerp(params.magnetFullMm, params.magnetFromMm, distanceMm);
  const distance = distanceMm * (1 - pull);
  const angle = angleDeg * (1 - pull);
  return {
    pull,
    distanceMm: distance,
    angleDeg: angle,
    snaps: distance <= params.snapDistanceMm && angle <= params.snapAngleDeg,
    clean: distanceMm <= params.cleanDistanceMm && angleDeg <= params.cleanAngleDeg,
  };
}
