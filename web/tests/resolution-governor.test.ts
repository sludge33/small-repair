import { describe, expect, it } from 'vitest';
import { ResolutionGovernor } from '../src/core/resolution-governor';

function draw(governor: ResolutionGovernor, deltaTime: number, frames: number) {
  let changes = 0;
  for (let i = 0; i < frames; i++) if (governor.drew(deltaTime)) changes++;
  return changes;
}

describe('ResolutionGovernor', () => {
  it('caps a very dense screen', () => {
    expect(new ResolutionGovernor(3.5).ratio).toBe(2);
  });

  it('keeps the resolution while frames are on time, including at a 30 fps cap', () => {
    const governor = new ResolutionGovernor(2);
    expect(draw(governor, 1 / 60, 1000)).toBe(0);
    expect(draw(governor, 1 / 30, 1000)).toBe(0);
    expect(governor.ratio).toBe(2);
  });

  it('forgives a single long frame', () => {
    const governor = new ResolutionGovernor(2);
    governor.drew(0.1);
    expect(draw(governor, 1 / 60, 1000)).toBe(0);
  });

  it('steps down when drawing stays slow, and stops at 1', () => {
    const governor = new ResolutionGovernor(2);
    expect(draw(governor, 1 / 20, 90)).toBe(1);
    expect(governor.ratio).toBe(1.5);
    draw(governor, 1 / 20, 1000);
    expect(governor.ratio).toBe(1);
  });

  it('never steps back up', () => {
    const governor = new ResolutionGovernor(2);
    draw(governor, 1 / 20, 90);
    draw(governor, 1 / 60, 1000);
    expect(governor.ratio).toBe(1.5);
  });

  it('never goes below a low-density screen', () => {
    const governor = new ResolutionGovernor(1);
    expect(draw(governor, 1 / 20, 1000)).toBe(0);
    expect(governor.ratio).toBe(1);
  });
});
