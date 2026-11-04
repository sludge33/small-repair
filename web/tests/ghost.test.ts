import { describe, expect, it } from 'vitest';
import { alongLine, defaultGhostParams, ghostPose, GhostTutor, type GhostMove } from '../src/core/ghost';

const { firstShowSeconds, reminderSeconds, fadeSeconds, liftSeconds } = defaultGhostParams;

/** Runs the tutor for a stretch of time and counts how many demonstrations start. */
function run(tutor: GhostTutor, seconds: number, verb: string | null, progress = 0, touching = false) {
  let started = 0;
  const frames = Math.round(seconds * 20);
  for (let i = 0; i < frames; i++) if (tutor.step(verb, progress, touching, 0.05)) started++;
  return started;
}

describe('GhostTutor', () => {
  it('shows a new verb shortly after it becomes live', () => {
    const tutor = new GhostTutor();
    expect(run(tutor, firstShowSeconds * 0.5, 'clean')).toBe(0);
    expect(run(tutor, firstShowSeconds, 'clean')).toBe(1);
  });

  it('waits for the finger to lift', () => {
    const tutor = new GhostTutor();
    expect(run(tutor, 5, 'clean', 0, true)).toBe(0);
    expect(run(tutor, firstShowSeconds + 0.1, 'clean')).toBe(1);
  });

  it('does not show a verb again to someone who is getting on with it', () => {
    const tutor = new GhostTutor();
    run(tutor, 1, 'clean');
    let started = 0;
    for (let i = 0; i < 40; i++) started += run(tutor, 1, 'clean', i / 100, i % 3 === 0);
    expect(started).toBe(0);
  });

  it('reminds someone who has stopped', () => {
    const tutor = new GhostTutor();
    run(tutor, firstShowSeconds + 0.1, 'clean');
    expect(run(tutor, reminderSeconds - 1, 'clean')).toBe(0);
    expect(run(tutor, 1.1, 'clean')).toBe(1);
  });

  it('only waits the short time the first time a verb comes round', () => {
    const tutor = new GhostTutor();
    run(tutor, 1, 'clean');
    run(tutor, 1, 'align');
    expect(run(tutor, 1, 'clean')).toBe(0);
  });

  it('shows nothing when no verb is live', () => {
    expect(run(new GhostTutor(), 60, null)).toBe(0);
  });
});

describe('ghostPose', () => {
  const at = (x: number, y: number) => [{ x, y }];
  const stroke: GhostMove = { seconds: 2, fingers: (t) => at(t * 100, 0) };
  const tap: GhostMove = { seconds: 0.5, fingers: () => at(500, 500) };

  it('fades in hovering over where it will press', () => {
    const pose = ghostPose([stroke], fadeSeconds / 2)!;
    expect(pose.down).toBe(false);
    expect(pose.opacity).toBeCloseTo(0.5);
    expect(pose.fingers[0].x).toBe(0);
  });

  it('presses and follows the path', () => {
    const pose = ghostPose([stroke], fadeSeconds + 1)!;
    expect(pose.down).toBe(true);
    expect(pose.opacity).toBe(1);
    expect(pose.fingers[0].x).toBeCloseTo(50);
  });

  it('lifts between presses without fading', () => {
    const pose = ghostPose([stroke, tap], fadeSeconds + 2 + liftSeconds / 2)!;
    expect(pose.down).toBe(false);
    expect(pose.opacity).toBe(1);
    expect(pose.fingers[0].x).toBeCloseTo(100);
  });

  it('moves on to the next press', () => {
    const pose = ghostPose([stroke, tap], fadeSeconds + 2 + liftSeconds + 0.1)!;
    expect(pose.down).toBe(true);
    expect(pose.fingers[0].x).toBe(500);
  });

  it('fades out at the end and then finishes', () => {
    const fading = ghostPose([tap], fadeSeconds + 0.5 + fadeSeconds / 2)!;
    expect(fading.down).toBe(false);
    expect(fading.opacity).toBeCloseTo(0.5);
    expect(ghostPose([tap], fadeSeconds * 2 + 0.6)).toBeNull();
  });

  it('has nothing to show for no moves', () => {
    expect(ghostPose([], 0)).toBeNull();
  });
});

describe('alongLine', () => {
  const mix = (a: { x: number }, b: { x: number }, t: number) => ({ x: a.x + (b.x - a.x) * t });
  const line = [{ x: 0 }, { x: 10 }, { x: 30 }];

  it('walks the points from end to end', () => {
    expect(alongLine(line, 0, mix).x).toBe(0);
    expect(alongLine(line, 0.25, mix).x).toBe(5);
    expect(alongLine(line, 1, mix).x).toBe(30);
  });

  it('copes with a single point', () => {
    expect(alongLine([{ x: 7 }], 0.5, mix).x).toBe(7);
  });
});
