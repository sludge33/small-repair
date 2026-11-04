import { describe, expect, it } from 'vitest';
import { BowlRepair, type StrokeTouch } from '../src/core/bowl-repair';
import { PROFILE_LENGTH_MM, radiusAt, type Uv } from '../src/core/bowl-surface';
import { SHARDS } from '../src/core/fracture';

const STEADY: StrokeTouch = { pressure: 0.5, steadiness: 1 };
const LOOSE: StrokeTouch = { pressure: 0.5, steadiness: 0.2 };

/** Offsets a crack point sideways by millimetres, for strokes that wander off the line. */
function offset(p: Uv, mm: number, index: number): Uv {
  const sign = index % 2 === 0 ? 1 : -1;
  return { u: p.u + (sign * mm) / (Math.PI * 2 * radiusAt(p.v)), v: p.v + (mm * 0.5) / PROFILE_LENGTH_MM };
}

/** Walks a finger along every crack, as a player tracing each seam does. Returns the number of passes it took. */
function traceUntilStepEnds(repair: BowlRepair, touch: StrokeTouch, wanderMm = 0, maxPasses = 12) {
  const step = repair.step;
  let passes = 0;
  while (repair.step === step && passes < maxPasses) {
    passes++;
    for (const shard of SHARDS) {
      let last: Uv | null = null;
      shard.crack.forEach((p, i) => {
        if (repair.step !== step) return;
        const at = wanderMm > 0 ? offset(p, wanderMm, i) : p;
        repair.stroke(last, at, touch);
        last = at;
      });
    }
  }
  return passes;
}

function seatAll(repair: BowlRepair) {
  SHARDS.forEach((_, i) => repair.seat(i, false));
}

function repairedTo(step: 'lacquer' | 'gold' | 'polish') {
  const repair = new BowlRepair();
  traceUntilStepEnds(repair, STEADY);
  seatAll(repair);
  if (step === 'lacquer') return repair;
  traceUntilStepEnds(repair, STEADY);
  repair.finishCure();
  if (step === 'gold') return repair;
  traceUntilStepEnds(repair, STEADY);
  return repair;
}

describe('BowlRepair steps', () => {
  it('runs clean, align, lacquer, cure, gold, polish, done', () => {
    const repair = new BowlRepair();
    expect(repair.step).toBe('clean');
    traceUntilStepEnds(repair, STEADY);
    expect(repair.step).toBe('align');
    seatAll(repair);
    expect(repair.step).toBe('lacquer');
    traceUntilStepEnds(repair, STEADY);
    expect(repair.step).toBe('cure');
    repair.finishCure();
    expect(repair.step).toBe('gold');
    traceUntilStepEnds(repair, STEADY);
    expect(repair.step).toBe('polish');
    traceUntilStepEnds(repair, STEADY);
    expect(repair.step).toBe('done');
    expect(repair.progress()).toBe(1);
  });

  it('asks for more than one scraping pass, and not too many', () => {
    const passes = traceUntilStepEnds(new BowlRepair(), STEADY);
    expect(passes).toBeGreaterThanOrEqual(2);
    expect(passes).toBeLessThanOrEqual(5);
  });

  it('leaves the step until every seam is done, however far the others are', () => {
    const repair = new BowlRepair();
    for (let pass = 0; pass < 8; pass++) {
      let last: Uv | null = null;
      for (const p of SHARDS[0].crack) {
        repair.stroke(last, p, STEADY);
        last = p;
      }
    }
    expect(repair.glue.coverage()[0]).toBeGreaterThan(0.9);
    expect(repair.step).toBe('clean');
    expect(repair.progress()).toBeGreaterThan(0.3);
    expect(repair.progress()).toBeLessThan(0.5);
  });

  it('seats each shard once and only moves on at the third', () => {
    const repair = new BowlRepair();
    repair.step = 'align';
    expect(repair.seat(0, true)).toBe(false);
    expect(repair.seat(0, false)).toBe(false);
    expect(repair.seatedClean[0]).toBe(true);
    expect(repair.progress()).toBeCloseTo(1 / 3, 5);
    repair.seat(1, false);
    expect(repair.seat(2, false)).toBe(true);
    expect(repair.step).toBe('lacquer');
  });

  it('resets to a fresh bowl', () => {
    const repair = repairedTo('gold');
    repair.reset();
    expect(repair.step).toBe('clean');
    expect(repair.seated.some(Boolean)).toBe(false);
    expect(repair.lacquer.coverage()[0]).toBe(0);
    expect(repair.quality.clean.total).toBe(0);
  });
});

describe('never punish', () => {
  it('completes every paint step with loose, wandering strokes', () => {
    const repair = new BowlRepair();
    traceUntilStepEnds(repair, LOOSE, 4);
    expect(repair.step).toBe('align');
    seatAll(repair);
    traceUntilStepEnds(repair, LOOSE, 4);
    expect(repair.step).toBe('cure');
    repair.finishCure();
    traceUntilStepEnds(repair, LOOSE, 4);
    expect(repair.step).toBe('polish');
    traceUntilStepEnds(repair, LOOSE, 4, 40);
    expect(repair.step).toBe('done');
  });

  it('can finish polishing even when gold only barely passed', () => {
    const repair = repairedTo('gold');
    repair.step = 'polish';
    traceUntilStepEnds(repair, STEADY, 0, 40);
    expect(repair.step).toBe('done');
  });
});

describe('clean bands', () => {
  it('rates strokes on the guide clean and strokes off it loose', () => {
    const onGuide = new BowlRepair();
    traceUntilStepEnds(onGuide, STEADY);
    expect(onGuide.quality.clean.clean / onGuide.quality.clean.total).toBeGreaterThan(0.95);

    const offGuide = new BowlRepair();
    traceUntilStepEnds(offGuide, STEADY, 5);
    // This stroke zigzags across the crack, so part of it really is on the guide.
    expect(offGuide.quality.clean.clean / offGuide.quality.clean.total).toBeLessThan(0.5);
  });

  it('rates a bead too thin or thick as loose', () => {
    const good = repairedTo('lacquer');
    traceUntilStepEnds(good, { pressure: 0.5, steadiness: 1 });
    expect(good.quality.lacquer.clean / good.quality.lacquer.total).toBeGreaterThan(0.95);

    const thin = repairedTo('lacquer');
    traceUntilStepEnds(thin, { pressure: 0, steadiness: 1 });
    expect(thin.quality.lacquer.clean).toBe(0);
  });

  it('polishes faster and rates cleaner with steady circles', () => {
    const steady = repairedTo('polish');
    const steadyPasses = traceUntilStepEnds(steady, STEADY, 0, 40);
    const jittery = repairedTo('polish');
    const jitteryPasses = traceUntilStepEnds(jittery, LOOSE, 0, 40);
    expect(jitteryPasses).toBeGreaterThan(steadyPasses);
    expect(steady.quality.polish.clean / steady.quality.polish.total).toBe(1);
    expect(jittery.quality.polish.clean).toBe(0);
  });
});

describe('gold', () => {
  it('sticks to the lacquer, not the glaze', () => {
    const repair = repairedTo('gold');
    const bare = { u: 0.35, v: 0.3 };
    repair.puff(bare);
    const index = Math.floor(bare.v * 512) * 1024 + Math.floor(bare.u * 1024);
    expect(repair.gold.data[index]).toBe(0);
  });

  it('gilds a seam from taps alone', () => {
    const repair = repairedTo('gold');
    for (const shard of SHARDS) for (const p of shard.crack) repair.puff(p);
    expect(repair.step).toBe('polish');
  });
});
