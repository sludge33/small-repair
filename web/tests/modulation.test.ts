import { describe, expect, it } from 'vitest';
import { GestureAnalyzer, type GestureFrame } from '../src/core/gesture';
import { ModulationMapper, defaultModulationParams as params, type ModulationFrame } from '../src/core/modulation';

const LONG_ENOUGH_TO_SETTLE = 1;
const FRAME_TIME = 1 / 120;
const [SLOW, MEDIUM, FAST] = params.speedLayerThresholds;

const near = (actual: number, expected: number, tolerance = 0.001) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

/** Drives the real analyzer and mapper, so tests see what the analyzer actually reports on lift. */
class LiveStroke {
  private readonly analyzer = new GestureAnalyzer();
  private readonly mapper = new ModulationMapper();
  private time = 0;
  private x = 0;

  run(seconds: number, touching: boolean, speed: number) {
    let result!: ModulationFrame;
    const frames = Math.max(1, Math.round(seconds / FRAME_TIME));
    for (let i = 0; i < frames; i++) {
      this.time += FRAME_TIME;
      this.x += speed * FRAME_TIME;
      const gesture = this.analyzer.step(this.time, touching, this.x, 0, 1);
      result = this.mapper.map(gesture, FRAME_TIME);
    }
    return result;
  }
}

function stroke(speed: number, { steadiness = 1, pressure = 0.5, x = 0.5 } = {}): GestureFrame {
  return { contact: 'held', x: 0, y: 0, normalizedX: x, normalizedY: 0.5, speed, steadiness, pressure };
}

const map = (gesture: GestureFrame) => new ModulationMapper().map(gesture, LONG_ENOUGH_TO_SETTLE);

describe('ModulationMapper', () => {
  it('plays each layer alone at its anchor', () => {
    const slow = map(stroke(SLOW));
    const medium = map(stroke(MEDIUM));
    const fast = map(stroke(FAST));

    near(slow.slowLayer, 1);
    near(slow.mediumLayer, 0);
    near(medium.mediumLayer, 1);
    near(medium.slowLayer, 0);
    near(medium.fastLayer, 0);
    near(fast.fastLayer, 1);
    near(fast.mediumLayer, 0);
  });

  it('crossfades layers with equal power', () => {
    const between = map(stroke((SLOW + MEDIUM) / 2));
    near(between.slowLayer ** 2 + between.mediumLayer ** 2, 1);
  });

  it('keeps pitch within the spec range', () => {
    near(map(stroke(0)).pitchSemitones, -3);
    near(map(stroke(MEDIUM)).pitchSemitones, 0);
    near(map(stroke(100000)).pitchSemitones, 3);
  });

  it('runs the low-pass from six kilohertz to full band', () => {
    near(map(stroke(500, { steadiness: 0 })).lowpassHz, 6000, 1);
    near(map(stroke(500, { steadiness: 1 })).lowpassHz, 20000, 1);
  });

  it('raises gain with pressure and is silent at rest', () => {
    expect(map(stroke(500, { pressure: 1 })).gain).toBeGreaterThan(map(stroke(500, { pressure: 0 })).gain);
    near(map(stroke(0)).gain, 0);
  });

  it('pans with finger x', () => {
    near(map(stroke(500, { x: 0 })).pan, -1);
    near(map(stroke(500, { x: 1 })).pan, 1);
  });

  it('fades in and tails out within the spec times', () => {
    const mapper = new ModulationMapper();
    const gesture = stroke(MEDIUM, { pressure: 1 });

    const afterTen = mapper.map(gesture, 0.01).gain;
    expect(afterTen).toBeGreaterThan(0);
    expect(afterTen).toBeLessThan(1);
    near(mapper.map(gesture, 0.03).gain, 1);

    gesture.contact = 'ended';
    expect(mapper.map(gesture, 0.06).gain).toBeGreaterThan(0);
    near(mapper.map(gesture, 0.12).gain, 0);
  });

  it('tracks speed with haptic ticks and stops them when the finger lifts', () => {
    const lifted = stroke(FAST);
    lifted.contact = 'none';

    near(map(stroke(FAST)).hapticTickRate, params.material.hapticTickRate);
    near(map(stroke(FAST / 2)).hapticTickRate, params.material.hapticTickRate / 2);
    expect(map(lifted).hapticTickRate).toBe(0);
  });

  it('tails out over the release time after a stroke', () => {
    const release = params.releaseMs / 1000;
    const live = new LiveStroke();

    const during = live.run(0.5, true, MEDIUM);
    expect(during.gain).toBeGreaterThan(0.9);

    const halfway = live.run(release / 2, false, 0);
    near(halfway.gain, during.gain / 2, 0.05);
    near(halfway.pitchSemitones, during.pitchSemitones);
    near(halfway.mediumLayer, during.mediumLayer);

    near(live.run(release, false, 0).gain, 0);
  });

  it('stays silent on lifting a finger that had stopped', () => {
    const live = new LiveStroke();
    live.run(0.5, true, MEDIUM);
    live.run(0.5, true, 0);
    near(live.run(FRAME_TIME, false, 0).gain, 0);
  });

  it('fades instead of cutting when re-touched during the tail', () => {
    const largestAllowedDrop = (2 * FRAME_TIME * 1000) / params.releaseMs;
    const live = new LiveStroke();

    live.run(0.5, true, MEDIUM);
    let previous = live.run(params.releaseMs / 4000, false, 0);
    expect(previous.gain).toBeGreaterThan(0.5);

    for (let i = 0; i < 12; i++) {
      const current = live.run(FRAME_TIME, true, 0);
      expect(previous.gain - current.gain).toBeLessThan(largestAllowedDrop);
      previous = current;
    }
  });

  it("does not let a new stroke inherit the last stroke's speed", () => {
    const live = new LiveStroke();
    live.run(0.5, true, FAST);
    live.run(LONG_ENOUGH_TO_SETTLE, false, 0);
    const began = live.run(FRAME_TIME, true, 0);

    near(began.gain, 0);
    near(began.fastLayer, 0);
  });
});
