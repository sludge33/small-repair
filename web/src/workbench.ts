import type { AudioEngine } from './audio/audio';
import type { BowlView } from './bowl-view';
import { STEP_TOOL, type BowlRepair, type StepId, type StrokeTool } from './core/bowl-repair';
import type { Uv } from './core/bowl-surface';
import { touchAction } from './core/bowl-touch';
import { isTouching, type GestureFrame } from './core/gesture';
import { TOOL_MATERIALS, defaultModulationParams, type Material } from './core/modulation';
import type { ShardFit } from './core/shard-fit';
import type { Haptics } from './haptics';
import type { GestureInput } from './input';
import type { ToolTray } from './tool-tray';
import { TwoFingerInput } from './two-finger-input';

const CURE_SECONDS = 10;
/** A held shard rides this far above a finger, so the finger does not hide what it is lining up. */
const TOUCH_LIFT_PX = 56;
const WHEEL_TWIST_RADIANS = (2 * Math.PI) / 180;
const WHEEL_ZOOM_RATE = 0.002;

type Action = 'none' | 'stroke' | 'orbit' | 'hold';

/** Plays one repair: decides what each touch does, feeds the rules, and cues the sounds and the tray. */
export class Workbench {
  private readonly twoFinger: TwoFingerInput;
  private action: Action = 'none';
  private shownStep: StepId | null = null;
  private lastUv: Uv | null = null;
  private onBowl = false;
  private lastX = 0;
  private lastY = 0;
  private heldIndex = 0;
  private heldFit: ShardFit | null = null;
  private lidClosing = false;
  private cureLeft: number | null = null;

  constructor(
    surface: HTMLElement,
    private readonly input: GestureInput,
    private readonly repair: BowlRepair,
    private readonly view: BowlView,
    private readonly audio: AudioEngine,
    private readonly haptics: Haptics,
    private readonly tray: ToolTray,
  ) {
    this.twoFinger = new TwoFingerInput(surface);
    tray.onSkipCure = () => {
      if (this.cureLeft !== null) this.cureLeft = 0;
    };
    tray.onAgain = () => this.restart();

    surface.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.ctrlKey) this.view.zoomBy(Math.exp(-e.deltaY * WHEEL_ZOOM_RATE));
        else if (this.action === 'hold') this.view.twistHeld(Math.sign(e.deltaY) * WHEEL_TWIST_RADIANS);
      },
      { passive: false },
    );
  }

  /** The material of the tool in hand, for the modulation. */
  get material(): Material {
    const tool = this.repair.step === 'done' ? null : STEP_TOOL[this.repair.step];
    return tool && tool in TOOL_MATERIALS ? TOOL_MATERIALS[tool as StrokeTool] : defaultModulationParams.material;
  }

  /** Runs one frame and returns the gesture audio and haptics should hear: silent unless a tool is touching the bowl. */
  step(gesture: GestureFrame, deltaTime: number): GestureFrame {
    this.showStepIfChanged();
    this.input.wheelIsPressure = this.action !== 'hold';

    const { x, y } = this.input.clientPosition;
    const fingers = this.twoFinger.take();
    if (this.action === 'hold') {
      this.view.twistHeld(fingers.twist);
    } else if (this.twoFinger.active) {
      this.action = 'none';
      this.view.orbit(fingers.panX, fingers.panY);
      this.view.zoomBy(fingers.scale);
    }

    if (gesture.contact === 'began' && !this.twoFinger.active) this.begin(x, y, gesture);
    else if (isTouching(gesture)) this.drag(x, y, gesture);
    else if (this.action !== 'none') this.end();

    this.stepCure(deltaTime);
    this.showStepIfChanged();
    this.tray.update(this.repair.step, this.repair.progress());

    const voiced = this.action === 'stroke' && this.onBowl;
    return voiced ? gesture : { ...gesture, contact: 'none', speed: 0 };
  }

  private begin(x: number, y: number, gesture: GestureFrame) {
    const { step } = this.repair;
    const hit = this.view.hitBowl(x, y);
    const shard = step === 'align' ? this.view.pickShard(x, y) : null;
    const action = touchAction(step, hit !== null, shard !== null);

    this.lastX = x;
    this.lastY = y;

    if (action === 'lid') {
      this.closeLid();
    } else if (action === 'orbit') {
      this.action = 'orbit';
    } else if (action === 'hold') {
      this.action = 'hold';
      this.heldIndex = shard!;
      this.view.grab(shard!);
      this.moveHeld(x, y);
    } else {
      this.action = 'stroke';
      if (step === 'gold') {
        this.repair.puff(hit!);
        this.audio.play('puff');
        this.haptics.pulse('puff');
      }
      this.strokeTo(hit, gesture);
    }
  }

  private drag(x: number, y: number, gesture: GestureFrame) {
    if (this.action === 'orbit') this.view.orbit(x - this.lastX, y - this.lastY);
    else if (this.action === 'hold') this.moveHeld(x, y);
    else if (this.action === 'stroke') this.strokeTo(this.view.hitBowl(x, y), gesture);
    this.lastX = x;
    this.lastY = y;
  }

  private end() {
    if (this.action === 'hold') {
      const fit = this.heldFit;
      this.audio.fitTone(0);
      this.view.release(fit?.snaps ?? false);
      if (fit?.snaps) {
        this.repair.seat(this.heldIndex, fit.clean);
        this.audio.play('seat');
        this.haptics.pulse('seat');
      }
      this.heldFit = null;
    }
    this.action = 'none';
    this.lastUv = null;
    this.onBowl = false;
  }

  private moveHeld(x: number, y: number) {
    this.heldFit = this.view.hold(x, this.input.isMouse ? y : y - TOUCH_LIFT_PX);
    this.audio.fitTone(this.heldFit.pull);
  }

  private strokeTo(hit: Uv | null, gesture: GestureFrame) {
    this.onBowl = hit !== null;
    if (hit) this.repair.stroke(this.lastUv, hit, { pressure: gesture.pressure, steadiness: gesture.steadiness });
    this.lastUv = hit;
  }

  private closeLid() {
    if (this.lidClosing) return;
    this.lidClosing = true;
    this.view.closeLid();
  }

  private stepCure(deltaTime: number) {
    if (!this.lidClosing) return;

    if (this.cureLeft === null) {
      if (!this.view.lidShut) return;
      this.audio.play('lid');
      this.haptics.pulse('lid');
      this.cureLeft = CURE_SECONDS;
      this.tray.showCure(true);
    }

    this.cureLeft -= deltaTime;
    if (this.cureLeft > 0) return;
    this.cureLeft = null;
    this.lidClosing = false;
    this.tray.showCure(false);
    this.view.openLid();
    this.repair.finishCure();
  }

  private showStepIfChanged() {
    const { step } = this.repair;
    if (step === this.shownStep) return;
    this.shownStep = step;

    // A stroke that finished its step must not spill into the next one, whose tool works differently.
    if (this.action === 'stroke') this.action = 'none';
    this.lastUv = null;
    this.onBowl = false;
    this.audio.setTool(step === 'done' ? null : STEP_TOOL[step]);
  }

  private restart() {
    this.repair.reset();
    this.view.reset();
    this.action = 'none';
    this.lidClosing = false;
    this.cureLeft = null;
    this.tray.showCure(false);
  }
}
