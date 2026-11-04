import { surfaceDistanceMm, type Uv } from './bowl-surface';
import { nearestCrackPoint, SHARDS, type Shard } from './fracture';
import { clamp01, inverseLerp, lerp } from './math';
import { PaintMask, rasterizeBands } from './paint-mask';

export type StepId = 'clean' | 'align' | 'lacquer' | 'cure' | 'gold' | 'polish' | 'done';
export type Tool = 'blade' | 'hands' | 'brush' | 'lid' | 'duster' | 'cloth';

const STEP_ORDER: StepId[] = ['clean', 'align', 'lacquer', 'cure', 'gold', 'polish', 'done'];

export const STEP_TOOL: Record<Exclude<StepId, 'done'>, Tool> = {
  clean: 'blade',
  align: 'hands',
  lacquer: 'brush',
  cure: 'lid',
  gold: 'duster',
  polish: 'cloth',
};

export const defaultRepairParams = {
  maskWidth: 1024,
  maskHeight: 512,
  /** Spec completion rules: share of every seam that must be done. */
  cleanThreshold: 0.9,
  lacquerThreshold: 0.95,
  goldThreshold: 0.9,
  polishThreshold: 0.85,

  /** Half the width of the old glue on either side of a crack. */
  glueBandMm: 3,
  /** Half the width of the seam that lacquer, gold and polish must cover. */
  seamBandMm: 1,

  /** A stroke this close to a crack has its paint guided fully on to it, up to guideStrength. */
  guideFullMm: 6,
  /** Past this distance a stroke gets no guidance at all. */
  guideFromMm: 11,
  /** Share of the way to the crack that guided paint lands. Loose strokes still wander, but still complete. */
  guideStrength: 0.75,
  /** Spec clean band: strokes within 2 mm of the guide. */
  cleanGuideMm: 2,

  bladeRadiusMm: 5,
  /** Value scraped per millimetre of stroke; sets how many passes an edge takes. */
  bladePerMm: 14,

  /** Bead radius at pressure 0 and 1. */
  brushMinRadiusMm: 1.3,
  brushMaxRadiusMm: 3.1,
  /** Spec clean band: bead width within 20% of this. */
  brushTargetRadiusMm: 2.2,
  brushWidthTolerance: 0.2,

  dusterRadiusMm: 10,
  dusterPerMm: 16,
  /** Value added by one tap of the duster. */
  dusterTap: 150,
  /** Duster strokes this far from a seam count as overspray. */
  dusterCleanMm: 5,

  clothRadiusMm: 6,
  clothPerMm: 2.4,
  /** A jittery stroke polishes at this share of the speed of a steady one. */
  clothJitteryShare: 0.4,
  /** Spec clean band: steady circles. */
  clothCleanSteadiness: 0.6,

  /** Hits further apart than this are a jump, such as from the outer wall to the inner, not a stroke between them. */
  strokeJumpMm: 40,
};

export type RepairParams = typeof defaultRepairParams;

export interface StrokeTouch {
  /** 0–1. */
  pressure: number;
  /** 0–1. */
  steadiness: number;
}

/** Stroke length inside and outside the clean band, in millimetres. For the reply letter's one line, never a grade. */
export interface StepQuality {
  clean: number;
  total: number;
}

/** The kintsugi bowl's rules: which step is live, what each tool's stroke does, and when a step is finished. */
export class BowlRepair {
  step: StepId = 'clean';
  /** 255 means clear of glue. Old glue is what is left at 0 in the band around each crack. */
  readonly glue: PaintMask;
  readonly lacquer: PaintMask;
  readonly gold: PaintMask;
  readonly sheen: PaintMask;
  readonly seated: boolean[];
  /** Whether each seated shard was lined up by hand before the magnet took it. */
  readonly seatedClean: boolean[];
  readonly quality: Record<'clean' | 'lacquer' | 'gold' | 'polish', StepQuality> = {
    clean: { clean: 0, total: 0 },
    lacquer: { clean: 0, total: 0 },
    gold: { clean: 0, total: 0 },
    polish: { clean: 0, total: 0 },
  };

  constructor(
    private readonly params: RepairParams = defaultRepairParams,
    private readonly shards: Shard[] = SHARDS,
  ) {
    const { maskWidth: w, maskHeight: h } = params;
    const cracks = shards.map((s) => s.crack);
    this.glue = new PaintMask(w, h, rasterizeBands(w, h, cracks, params.glueBandMm), 255);
    const seams = rasterizeBands(w, h, cracks, params.seamBandMm);
    this.lacquer = new PaintMask(w, h, seams);
    this.gold = new PaintMask(w, h, seams);
    this.sheen = new PaintMask(w, h, seams);
    this.seated = shards.map(() => false);
    this.seatedClean = shards.map(() => false);
  }

  reset() {
    this.step = 'clean';
    for (const mask of [this.glue, this.lacquer, this.gold, this.sheen]) mask.reset();
    this.seated.fill(false);
    this.seatedClean.fill(false);
    for (const q of Object.values(this.quality)) {
      q.clean = 0;
      q.total = 0;
    }
  }

  /** One frame of a tool stroke. @param from The last hit of this stroke, or null when it has just started. */
  stroke(from: Uv | null, to: Uv, touch: StrokeTouch) {
    const spacing = Math.max(this.strokeRadius(touch) * 0.5, 0.5);
    const distance = from ? surfaceDistanceMm(from, to) : 0;

    if (!from || distance > this.params.strokeJumpMm) {
      this.paint(to, 0, touch);
    } else {
      const steps = Math.max(1, Math.ceil(distance / spacing));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        this.paint({ u: from.u + (to.u - from.u) * t, v: from.v + (to.v - from.v) * t }, distance / steps, touch);
      }
    }
    this.finishPaintStep();
  }

  /** A tap of the gold duster. */
  puff(at: Uv) {
    if (this.step !== 'gold') return;
    this.gold.stamp(at, this.params.dusterRadiusMm, this.params.dusterTap, this.lacquer);
    this.addQuality('gold', this.params.dusterRadiusMm, nearestCrackPoint(at, this.shards).distanceMm <= this.params.dusterCleanMm);
    this.finishPaintStep();
  }

  /** Seats a shard. Returns true when that was the last one and the step has moved on. */
  seat(index: number, clean: boolean) {
    if (this.step !== 'align' || this.seated[index]) return false;
    this.seated[index] = true;
    this.seatedClean[index] = clean;
    if (!this.seated.every(Boolean)) return false;
    this.advance();
    return true;
  }

  /** The lid has closed and the wait is over or skipped. */
  finishCure() {
    if (this.step === 'cure') this.advance();
  }

  /** 0–1 towards finishing the live step, for the ring around the tool tray. */
  progress() {
    if (this.step === 'align') return this.seated.filter(Boolean).length / this.seated.length;
    if (this.step === 'done') return 1;
    const live = this.liveMask();
    if (!live) return 0;
    const [mask, threshold] = live;
    const coverage = mask.coverage();
    let sum = 0;
    for (const c of coverage) sum += clamp01(c / threshold);
    return sum / coverage.length;
  }

  private liveMask(): [PaintMask, number] | null {
    const p = this.params;
    if (this.step === 'clean') return [this.glue, p.cleanThreshold];
    if (this.step === 'lacquer') return [this.lacquer, p.lacquerThreshold];
    if (this.step === 'gold') return [this.gold, p.goldThreshold];
    if (this.step === 'polish') return [this.sheen, p.polishThreshold];
    return null;
  }

  private strokeRadius(touch: StrokeTouch) {
    const p = this.params;
    if (this.step === 'clean') return p.bladeRadiusMm;
    if (this.step === 'lacquer') return lerp(p.brushMinRadiusMm, p.brushMaxRadiusMm, touch.pressure);
    if (this.step === 'gold') return p.dusterRadiusMm;
    return p.clothRadiusMm;
  }

  /** Moves paint part of the way on to a nearby crack, which is the generous tolerance that lets a loose stroke complete. */
  private guided(at: Uv, crack: Uv & { distanceMm: number }): Uv {
    const p = this.params;
    const t = p.guideStrength * (1 - inverseLerp(p.guideFullMm, p.guideFromMm, crack.distanceMm));
    return { u: at.u + (crack.u - at.u) * t, v: at.v + (crack.v - at.v) * t };
  }

  private paint(at: Uv, lengthMm: number, touch: StrokeTouch) {
    const p = this.params;
    if (this.step === 'clean') {
      const crack = nearestCrackPoint(at, this.shards);
      this.glue.stamp(this.guided(at, crack), p.bladeRadiusMm, p.bladePerMm * lengthMm);
      this.addQuality('clean', lengthMm, crack.distanceMm <= p.cleanGuideMm);
    } else if (this.step === 'lacquer') {
      const crack = nearestCrackPoint(at, this.shards);
      const radius = lerp(p.brushMinRadiusMm, p.brushMaxRadiusMm, touch.pressure);
      this.lacquer.stamp(this.guided(at, crack), radius, 255);
      const widthClean = Math.abs(radius - p.brushTargetRadiusMm) / p.brushTargetRadiusMm <= p.brushWidthTolerance;
      this.addQuality('lacquer', lengthMm, widthClean && crack.distanceMm <= p.cleanGuideMm);
    } else if (this.step === 'gold') {
      this.gold.stamp(at, p.dusterRadiusMm, p.dusterPerMm * lengthMm, this.lacquer);
      this.addQuality('gold', lengthMm, nearestCrackPoint(at, this.shards).distanceMm <= p.dusterCleanMm);
    } else if (this.step === 'polish') {
      const rate = lerp(p.clothJitteryShare, 1, touch.steadiness);
      this.sheen.stamp(at, p.clothRadiusMm, p.clothPerMm * lengthMm * rate, this.gold);
      this.addQuality('polish', lengthMm, touch.steadiness >= p.clothCleanSteadiness);
    }
  }

  private addQuality(step: keyof BowlRepair['quality'], lengthMm: number, clean: boolean) {
    const q = this.quality[step];
    q.total += lengthMm;
    if (clean) q.clean += lengthMm;
  }

  private finishPaintStep() {
    const live = this.liveMask();
    if (live && live[0].coverage().every((c) => c >= live[1])) this.advance();
  }

  private advance() {
    this.step = STEP_ORDER[STEP_ORDER.indexOf(this.step) + 1];
  }
}
