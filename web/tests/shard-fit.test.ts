import { describe, expect, it } from 'vitest';
import { defaultFitParams, judgeFit } from '../src/core/shard-fit';

describe('judgeFit', () => {
  it('leaves a far shard entirely to the finger', () => {
    const fit = judgeFit(60, 20);
    expect(fit.pull).toBe(0);
    expect(fit.distanceMm).toBe(60);
    expect(fit.snaps).toBe(false);
  });

  it('pulls harder as the shard gets close', () => {
    expect(judgeFit(18, 10).pull).toBeGreaterThan(judgeFit(21, 10).pull);
    expect(judgeFit(18, 10).distanceMm).toBeLessThan(18);
  });

  it('seats a shard that was never rotated, so one thumb can finish the step', () => {
    const fit = judgeFit(defaultFitParams.magnetFullMm, 35);
    expect(fit.snaps).toBe(true);
    expect(fit.clean).toBe(false);
  });

  it('does not snap until both distance and angle are inside the rule', () => {
    expect(judgeFit(20, 35).snaps).toBe(false);
    // A magnet too short to reach, so these test the snap rule alone.
    const params = { ...defaultFitParams, magnetFromMm: 0.001, magnetFullMm: 0 };
    expect(judgeFit(3, 4, params).snaps).toBe(true);
    expect(judgeFit(3.1, 4, params).snaps).toBe(false);
    expect(judgeFit(3, 4.1, params).snaps).toBe(false);
  });

  it('calls a fit clean only when the finger did the work', () => {
    expect(judgeFit(0.8, 0.5).clean).toBe(true);
    expect(judgeFit(1.2, 0.5).clean).toBe(false);
    expect(judgeFit(0.8, 1.5).clean).toBe(false);
  });
});
