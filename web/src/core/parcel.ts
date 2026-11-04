import { clamp01 } from './math';
import type { Point } from './two-finger';

/**
 * The box a bowl arrives and leaves in, seen from above. Positions are shares of the box's width and height:
 * (0, 0) is its top left corner and the tape runs down the middle, along the seam where the two flaps meet.
 * Touches outside the box still count, because an open flap hangs over its edge.
 */

export type ParcelStep = 'cut' | 'lift' | 'pull' | 'opened' | 'fold' | 'close' | 'seal' | 'sealed';
export type ParcelAction = 'tape' | 'flap' | 'tissue';

export const defaultParcelParams = {
  /** Spec: tape cut along at least 80% of its length. Sealing uses the same share. */
  tapeThreshold: 0.8,
  tapeBins: 40,
  /** A stroke this far either side of the tape's line counts as on it. */
  tapeReach: 0.14,
  /** A drag this long fully opens or closes a flap, or fully moves the tissue. */
  flapDrag: 0.5,
  tissueDrag: 0.6,
  /** Let go past this share and the flap or tissue finishes the move; short of it, it falls back. */
  commit: 0.5,
};

export type ParcelParams = typeof defaultParcelParams;

const TAPE_X = 0.5;

/** The rules of opening the box and of packing it again, which is the same three actions in reverse. */
export class Parcel {
  step: ParcelStep = 'cut';
  /** Each stretch of tape: cut when opening, laid down when sealing. */
  readonly tape: boolean[];
  /** How far open each flap is, 0–1. Left, then right. */
  readonly flaps = [0, 0];
  /** How far clear of the bowl the tissue is, 0–1. */
  tissue = 0;

  private heldFlap: number | null = null;
  private grabX = 0;
  private grabY = 0;

  constructor(private readonly params: ParcelParams = defaultParcelParams) {
    this.tape = new Array<boolean>(params.tapeBins).fill(false);
  }

  /** Ready to open: tape whole, flaps shut, tissue over the bowl. */
  startOpening() {
    this.step = 'cut';
    this.tape.fill(false);
    this.flaps.fill(0);
    this.tissue = 0;
  }

  /** Ready to pack: no tape, flaps open, tissue set aside. */
  startPacking() {
    this.step = 'fold';
    this.tape.fill(false);
    this.flaps.fill(1);
    this.tissue = 1;
  }

  /** What a touch on the live step moves, or null if there is nothing left for it to move. */
  grab(at: Point): ParcelAction | null {
    this.grabX = at.x;
    this.grabY = at.y;
    if (this.step === 'cut' || this.step === 'seal') return 'tape';
    if (this.step === 'pull' || this.step === 'fold') return 'tissue';
    if (this.step !== 'lift' && this.step !== 'close') return null;

    const flap = at.x < TAPE_X ? 0 : 1;
    if (this.flaps[flap] === this.flapGoal()) return null;
    this.heldFlap = flap;
    return 'flap';
  }

  /** One frame of a stroke along the tape. Returns whether it touched the tape. */
  strokeTape(from: Point | null, to: Point) {
    if (this.step !== 'cut' && this.step !== 'seal') return false;

    const start = from ?? to;
    const bins = this.tape.length;
    const first = Math.floor(clamp01(Math.min(start.y, to.y)) * bins);
    const last = Math.min(bins - 1, Math.floor(clamp01(Math.max(start.y, to.y)) * bins));
    const spanY = to.y - start.y;

    let touched = false;
    for (let i = first; i <= last; i++) {
      const y = (i + 0.5) / bins;
      const t = spanY !== 0 ? clamp01((y - start.y) / spanY) : 1;
      const x = start.x + (to.x - start.x) * t;
      if (Math.abs(x - TAPE_X) > this.params.tapeReach) continue;
      this.tape[i] = true;
      touched = true;
    }

    if (this.tapeDone >= this.params.tapeThreshold) {
      this.tape.fill(true);
      this.step = this.step === 'cut' ? 'lift' : 'sealed';
    }
    return touched;
  }

  /** Share of the tape cut or laid, 0–1. */
  get tapeDone() {
    return this.tape.filter(Boolean).length / this.tape.length;
  }

  /** Moves the held flap with the finger. */
  dragFlap(at: Point) {
    if (this.heldFlap === null) return;
    const outward = this.heldFlap === 0 ? this.grabX - at.x : at.x - this.grabX;
    const opening = this.step === 'lift';
    const amount = clamp01((opening ? outward : -outward) / this.params.flapDrag);
    this.flaps[this.heldFlap] = opening ? amount : 1 - amount;
  }

  /** Lets go of the held flap. Returns true when that finished its move. */
  releaseFlap() {
    if (this.heldFlap === null) return false;
    const goal = this.flapGoal();
    const flap = this.heldFlap;
    this.heldFlap = null;

    const committed = Math.abs(this.flaps[flap] - goal) <= this.params.commit;
    this.flaps[flap] = committed ? goal : 1 - goal;
    if (this.flaps.every((f) => f === goal)) this.step = this.step === 'lift' ? 'pull' : 'seal';
    return committed;
  }

  /** Moves the tissue with the finger: up to pull it clear, down to fold it over. */
  dragTissue(at: Point) {
    const pulling = this.step === 'pull';
    const amount = clamp01((pulling ? this.grabY - at.y : at.y - this.grabY) / this.params.tissueDrag);
    this.tissue = pulling ? amount : 1 - amount;
  }

  /** Lets go of the tissue. Returns true when that finished its move. */
  releaseTissue() {
    const pulling = this.step === 'pull';
    const goal = pulling ? 1 : 0;
    const committed = Math.abs(this.tissue - goal) <= this.params.commit;
    this.tissue = committed ? goal : 1 - goal;
    if (committed) this.step = pulling ? 'opened' : 'close';
    return committed;
  }

  private flapGoal() {
    return this.step === 'lift' ? 1 : 0;
  }
}
