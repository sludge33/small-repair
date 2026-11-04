import { describe, expect, it } from 'vitest';
import { Parcel, type ParcelStep } from '../src/core/parcel';

/** A straight drag down the tape, sampled the way frames would. */
function drawAlongTape(parcel: Parcel, x: number, fromY: number, toY: number) {
  parcel.grab({ x, y: fromY });
  let last = { x, y: fromY };
  let touched = false;
  for (let i = 1; i <= 8; i++) {
    const at = { x, y: fromY + ((toY - fromY) * i) / 8 };
    touched = parcel.strokeTape(last, at) || touched;
    last = at;
  }
  return touched;
}

function dragFlap(parcel: Parcel, fromX: number, toX: number) {
  parcel.grab({ x: fromX, y: 0.5 });
  parcel.dragFlap({ x: toX, y: 0.5 });
  return parcel.releaseFlap();
}

function dragTissue(parcel: Parcel, fromY: number, toY: number) {
  parcel.grab({ x: 0.5, y: fromY });
  parcel.dragTissue({ x: 0.5, y: toY });
  return parcel.releaseTissue();
}

function openedUpTo(step: ParcelStep) {
  const parcel = new Parcel();
  if (step === 'cut') return parcel;
  drawAlongTape(parcel, 0.5, 0, 1);
  if (step === 'lift') return parcel;
  dragFlap(parcel, 0.3, -0.2);
  dragFlap(parcel, 0.7, 1.2);
  return parcel;
}

describe('cutting the tape', () => {
  it('needs the spec share of its length before the flaps can lift', () => {
    const parcel = new Parcel();
    drawAlongTape(parcel, 0.5, 0, 0.75);
    expect(parcel.step).toBe('cut');
    drawAlongTape(parcel, 0.5, 0.75, 0.82);
    expect(parcel.step).toBe('lift');
    expect(parcel.tapeDone).toBe(1);
  });

  it('adds up several short strokes, in either direction', () => {
    const parcel = new Parcel();
    drawAlongTape(parcel, 0.5, 0.45, 0);
    expect(parcel.tapeDone).toBeCloseTo(0.45, 1);
    drawAlongTape(parcel, 0.5, 0.45, 0.9);
    expect(parcel.step).toBe('lift');
  });

  it('forgives a loose stroke but not one nowhere near the tape', () => {
    const near = new Parcel();
    expect(drawAlongTape(near, 0.6, 0, 1)).toBe(true);
    expect(near.step).toBe('lift');

    const far = new Parcel();
    expect(drawAlongTape(far, 0.9, 0, 1)).toBe(false);
    expect(far.tapeDone).toBe(0);
  });

  it('fills every stretch a fast stroke crosses in one frame', () => {
    const parcel = new Parcel();
    parcel.grab({ x: 0.5, y: 0 });
    parcel.strokeTape({ x: 0.5, y: 0 }, { x: 0.5, y: 1 });
    expect(parcel.step).toBe('lift');
  });
});

describe('the flaps', () => {
  it('opens each flap by dragging it away from the seam, whichever comes first', () => {
    const parcel = openedUpTo('lift');
    expect(dragFlap(parcel, 0.8, 1.3)).toBe(true);
    expect(parcel.flaps).toEqual([0, 1]);
    expect(parcel.step).toBe('lift');
    expect(dragFlap(parcel, 0.2, -0.3)).toBe(true);
    expect(parcel.step).toBe('pull');
  });

  it('lets a short drag fall back without penalty', () => {
    const parcel = openedUpTo('lift');
    expect(dragFlap(parcel, 0.2, 0.1)).toBe(false);
    expect(parcel.flaps[0]).toBe(0);
    expect(dragFlap(parcel, 0.2, -0.3)).toBe(true);
  });

  it('does not open a flap dragged towards the seam', () => {
    const parcel = openedUpTo('lift');
    expect(dragFlap(parcel, 0.1, 0.45)).toBe(false);
    expect(parcel.flaps[0]).toBe(0);
  });

  it('ignores a touch on a flap that has already finished', () => {
    const parcel = openedUpTo('lift');
    dragFlap(parcel, 0.2, -0.3);
    expect(parcel.grab({ x: 0.2, y: 0.5 })).toBeNull();
  });

  it('follows the finger while it is held', () => {
    const parcel = openedUpTo('lift');
    parcel.grab({ x: 0.3, y: 0.5 });
    parcel.dragFlap({ x: 0.05, y: 0.5 });
    expect(parcel.flaps[0]).toBeCloseTo(0.5);
  });
});

describe('the tissue', () => {
  it('finishes opening when pulled clear upwards', () => {
    const parcel = openedUpTo('pull');
    expect(parcel.step).toBe('pull');
    expect(dragTissue(parcel, 0.6, 0.1)).toBe(true);
    expect(parcel.tissue).toBe(1);
    expect(parcel.step).toBe('opened');
  });

  it('settles back over the bowl after a short pull', () => {
    const parcel = openedUpTo('pull');
    expect(dragTissue(parcel, 0.6, 0.5)).toBe(false);
    expect(parcel.tissue).toBe(0);
    expect(parcel.step).toBe('pull');
  });
});

describe('packing', () => {
  it('runs fold, close, seal, sealed, starting with the box open and no tape', () => {
    const parcel = new Parcel();
    parcel.startPacking();
    expect(parcel.step).toBe('fold');
    expect(parcel.flaps).toEqual([1, 1]);
    expect(parcel.tissue).toBe(1);
    expect(parcel.tapeDone).toBe(0);

    expect(dragTissue(parcel, 0.1, 0.6)).toBe(true);
    expect(parcel.tissue).toBe(0);
    expect(parcel.step).toBe('close');

    expect(dragFlap(parcel, -0.1, 0.4)).toBe(true);
    expect(parcel.step).toBe('close');
    expect(dragFlap(parcel, 1.1, 0.6)).toBe(true);
    expect(parcel.flaps).toEqual([0, 0]);
    expect(parcel.step).toBe('seal');

    drawAlongTape(parcel, 0.5, 0, 1);
    expect(parcel.step).toBe('sealed');
  });

  it('goes back to a taped, closed box to open again', () => {
    const parcel = new Parcel();
    parcel.startPacking();
    parcel.startOpening();
    expect(parcel.step).toBe('cut');
    expect(parcel.flaps).toEqual([0, 0]);
    expect(parcel.tissue).toBe(0);
    expect(parcel.tapeDone).toBe(0);
  });

  it('has nothing left to grab once finished', () => {
    const parcel = openedUpTo('pull');
    dragTissue(parcel, 0.6, 0.1);
    expect(parcel.grab({ x: 0.5, y: 0.5 })).toBeNull();
  });
});
