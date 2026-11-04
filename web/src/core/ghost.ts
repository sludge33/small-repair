import { clamp01 } from './math';
import type { Point } from './two-finger';

/**
 * The ghost hand's rules: when it demonstrates a verb, and where its fingers are during a demonstration.
 * Paths are functions rather than fixed points so the hand stays on the bowl if the bowl is still turning.
 */

export const defaultGhostParams = {
  /** A new verb waits this long after the finger lifts, so the demonstration does not jump in on the last stroke. */
  firstShowSeconds: 0.6,
  /** A verb already shown comes back only after this long with no touch and no progress. */
  reminderSeconds: 9,
  /** Hovering before the first press, and before the hand fades after the last lift. */
  fadeSeconds: 0.3,
  /** Hovering between one press and the next. */
  liftSeconds: 0.2,
};

export type GhostParams = typeof defaultGhostParams;

/** One press: the fingers on the glass, from t = 0 to t = 1. */
export interface GhostMove {
  seconds: number;
  fingers: (t: number) => Point[];
}

export interface GhostPose {
  fingers: Point[];
  down: boolean;
  opacity: number;
}

/** Decides when to demonstrate. Each verb is shown once, then again only to someone who has stopped. */
export class GhostTutor {
  private readonly shown = new Set<string>();
  private verb: string | null = null;
  private progress = 0;
  private idle = 0;

  constructor(private readonly params: GhostParams = defaultGhostParams) {}

  /**
   * @param verb What the player should do now, or null when nothing needs showing.
   * @param progress 0–1 towards finishing that verb.
   * @returns True on the frame a demonstration should start.
   */
  step(verb: string | null, progress: number, touching: boolean, deltaTime: number) {
    if (verb !== this.verb || progress !== this.progress || touching) this.idle = 0;
    else this.idle += deltaTime;
    this.verb = verb;
    this.progress = progress;
    if (verb === null) return false;

    const wait = this.shown.has(verb) ? this.params.reminderSeconds : this.params.firstShowSeconds;
    if (this.idle < wait) return false;

    this.shown.add(verb);
    this.idle = 0;
    return true;
  }
}

/** Where the hand is, a number of seconds into a demonstration. Null once it has finished. */
export function ghostPose(moves: GhostMove[], elapsed: number, params: GhostParams = defaultGhostParams): GhostPose | null {
  const { fadeSeconds: fade, liftSeconds: lift } = params;
  if (moves.length === 0) return null;

  let clock = elapsed;
  if (clock < fade) return { fingers: moves[0].fingers(0), down: false, opacity: clock / fade };
  clock -= fade;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (clock < move.seconds) return { fingers: move.fingers(clamp01(clock / move.seconds)), down: true, opacity: 1 };
    clock -= move.seconds;

    const last = i === moves.length - 1;
    const pause = last ? fade : lift;
    if (clock < pause) return { fingers: move.fingers(1), down: false, opacity: last ? 1 - clock / fade : 1 };
    clock -= pause;
  }
  return null;
}

/** A point along a line of points, by share of their count. Close enough for a hand to trace. */
export function alongLine<T extends object>(line: T[], t: number, mix: (a: T, b: T, share: number) => T): T {
  const at = clamp01(t) * (line.length - 1);
  const i = Math.min(Math.floor(at), line.length - 2);
  return line.length < 2 ? line[0] : mix(line[i], line[i + 1], at - i);
}
