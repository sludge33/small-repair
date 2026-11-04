import type { StrokeTool } from './bowl-repair';
import { isTouching, type GestureFrame } from './gesture';
import { clamp01, inverseLerp, lerp, moveTowards } from './math';

export const defaultModulationParams = {
  /** Speeds (reference px/s) where the slow, medium and fast takes play alone. Between two anchors they crossfade. */
  speedLayerThresholds: [250, 900, 2200] as [number, number, number],
  /** Pitch offset at the slow and fast anchors, in semitones. Spec default 3. */
  pitchRange: 3,
  /** Spec default 6 kHz at the worst steadiness. */
  steadinessLowpassHz: 6000,
  /** Low-pass frequency for a fully steady stroke, which is effectively full-band. */
  fullBandHz: 20000,
  /** Gain at pressure 0; pressure 1 is always full gain. */
  minPressureGain: 0.35,
  /** Spec range 20–40 ms. */
  attackMs: 30,
  /** Spec range 80–150 ms. */
  releaseMs: 120,
  material: {
    name: 'Ceramic',
    /** Tick rate at the fast speed anchor; scales down with stroke speed. */
    hapticTickRate: 45,
    hapticSharpness: 0.9,
  },
};

export type ModulationParams = typeof defaultModulationParams;
export type Material = ModulationParams['material'];

export const TOOL_MATERIALS: Record<StrokeTool, Material> = {
  blade: defaultModulationParams.material,
  brush: { name: 'Lacquer', hapticTickRate: 18, hapticSharpness: 0.2 },
  duster: { name: 'Gold dust', hapticTickRate: 10, hapticSharpness: 0.1 },
  cloth: { name: 'Cloth on gold', hapticTickRate: 28, hapticSharpness: 0.45 },
};

/** The values audio and haptics should use this frame, following the spec's gesture-to-sound table. */
export interface ModulationFrame {
  slowLayer: number;
  mediumLayer: number;
  fastLayer: number;
  pitchSemitones: number;
  lowpassHz: number;
  /** Volume after the contact envelope, stroke movement and pressure. */
  gain: number;
  /** Low-frequency body, 0–1, rising with pressure. */
  body: number;
  /** -1 is left, 1 is right. */
  pan: number;
  /** Haptic ticks per second; 0 means no ticks. */
  hapticTickRate: number;
  hapticSharpness: number;
}

/** Maps gesture frames to modulation values. Holds the contact envelope and the last stroke speed as state. */
export class ModulationMapper {
  /** What the tool in hand is touching; sets the haptic texture. */
  material: Material;

  private envelope = 0;
  private strokeSpeed = 0;
  private moving = 0;

  constructor(private readonly params: ModulationParams = defaultModulationParams) {
    this.material = params.material;
  }

  map(gesture: GestureFrame, deltaTime: number): ModulationFrame {
    const p = this.params;
    const touching = isTouching(gesture);
    this.envelope = this.ramp(this.envelope, touching ? 1 : 0, deltaTime);

    const [slowAnchor, mediumAnchor, fastAnchor] = p.speedLayerThresholds;

    // The analyzer reports speed 0 as soon as the finger lifts. The release tail keeps the stroke's last speed,
    // otherwise gain would cut to silence and pitch would jump instead of tailing out.
    if (touching) this.strokeSpeed = gesture.speed;
    const speed = this.strokeSpeed;

    const slowToMedium = inverseLerp(slowAnchor, mediumAnchor, speed);
    const mediumToFast = inverseLerp(mediumAnchor, fastAnchor, speed);

    // A finger at rest makes no sound, so gain follows movement up to the slow anchor. It ramps rather than jumps:
    // a re-touch during the release tail starts at speed 0 and would otherwise cut the tail with a click.
    this.moving = this.ramp(this.moving, clamp01(speed / Math.max(slowAnchor, 1)), deltaTime);

    // Once the tail has finished nothing is left to protect, and a new stroke must not start from the old movement.
    if (this.envelope <= 0) this.moving = 0;
    const pressureGain = lerp(p.minPressureGain, 1, gesture.pressure);

    const pitch = speed < mediumAnchor ? lerp(-p.pitchRange, 0, slowToMedium) : lerp(0, p.pitchRange, mediumToFast);

    // Interpolate in log frequency, which matches how the filter sounds.
    const lowpass = Math.exp(lerp(Math.log(p.steadinessLowpassHz), Math.log(p.fullBandHz), gesture.steadiness));

    return {
      // Equal-power crossfades keep loudness even across the speed layers.
      slowLayer: Math.cos(slowToMedium * Math.PI * 0.5),
      mediumLayer: Math.sin(slowToMedium * Math.PI * 0.5) * Math.cos(mediumToFast * Math.PI * 0.5),
      fastLayer: Math.sin(mediumToFast * Math.PI * 0.5),
      pitchSemitones: pitch,
      lowpassHz: lowpass,
      gain: this.envelope * this.moving * pressureGain,
      body: gesture.pressure,
      pan: gesture.normalizedX * 2 - 1,
      hapticTickRate: touching ? this.material.hapticTickRate * clamp01(speed / Math.max(fastAnchor, 1)) : 0,
      hapticSharpness: this.material.hapticSharpness,
    };
  }

  /** Rises over the attack time and falls over the release time. */
  private ramp(current: number, target: number, deltaTime: number) {
    const ms = target > current ? this.params.attackMs : this.params.releaseMs;
    const step = ms > 0 ? (deltaTime * 1000) / ms : 1;
    return moveTowards(current, target, step);
  }
}
