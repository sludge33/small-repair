import type { AudioEngine } from './audio/audio';
import type { GhostMove } from './core/ghost';
import { isTouching, type GestureFrame } from './core/gesture';
import { lerp } from './core/math';
import { TOOL_MATERIALS, defaultModulationParams, type Material } from './core/modulation';
import { Parcel, type ParcelAction, type ParcelStep } from './core/parcel';
import type { FoleyTool } from './core/scrape-layers';
import type { Point } from './core/two-finger';
import type { Haptics } from './haptics';
import type { GestureInput } from './input';

/** How long the open box stays in view before the note comes up. */
const OPENED_PAUSE_S = 0.5;
/** How long the sealed box takes to leave. */
const SENT_PAUSE_S = 0.9;

const VOICES: Partial<Record<ParcelStep, FoleyTool>> = { cut: 'tape', seal: 'tape', pull: 'tissue', fold: 'tissue' };

/** The box from above, drawn flat: only the object under repair is 3D. Everything is laid out by the stylesheet. */
class ParcelView {
  private readonly box: HTMLElement;
  private readonly tissue: HTMLElement;
  private readonly flaps: HTMLElement[];
  private readonly tape: HTMLElement;
  private readonly bins: HTMLElement[] = [];

  constructor(
    private readonly root: HTMLElement,
    binCount: number,
  ) {
    root.innerHTML = `
      <div class="box">
        <div class="box-inside">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" class="bowl-rim" />
            <circle cx="50" cy="50" r="19" class="bowl-well" />
            <path d="M20 16 L31 33 L27 46 L42 53" class="bowl-crack" />
            <path d="M84 30 L68 41 L71 58" class="bowl-crack" />
            <path d="M46 96 L52 76 L64 70 L81 79" class="bowl-crack" />
          </svg>
        </div>
        <div class="tissue"></div>
        <div class="flap left"></div>
        <div class="flap right"></div>
        <div class="tape"></div>
      </div>`;
    this.box = root.querySelector('.box')!;
    this.tissue = root.querySelector('.tissue')!;
    this.flaps = [root.querySelector('.flap.left')!, root.querySelector('.flap.right')!];
    this.tape = root.querySelector('.tape')!;
    for (let i = 0; i < binCount; i++) {
      const bin = document.createElement('div');
      this.tape.append(bin);
      this.bins.push(bin);
    }
  }

  set visible(visible: boolean) {
    this.root.hidden = !visible;
  }

  /** Whether the box is on its way back, which shows the mended bowl and leaves off the tape already cut. */
  set packing(packing: boolean) {
    this.box.classList.toggle('packing', packing);
    this.box.classList.remove('sent');
  }

  send() {
    this.box.classList.add('sent');
  }

  update(parcel: Parcel, held: ParcelAction | null) {
    this.tissue.classList.toggle('held', held === 'tissue');
    this.tissue.style.transform = `translateY(${-parcel.tissue * 104}%) rotate(${parcel.tissue * 4}deg)`;

    this.flaps.forEach((flap, i) => {
      flap.classList.toggle('held', held === 'flap');
      flap.style.setProperty('--open', String(parcel.flaps[i]));
    });

    const { step } = parcel;
    this.tape.hidden = step !== 'cut' && step !== 'seal' && step !== 'sealed';
    this.tape.classList.toggle('cutting', step === 'cut');
    this.bins.forEach((bin, i) => bin.classList.toggle('done', parcel.tape[i]));
  }

  /** From the screen to the box's own positions. */
  toBox(x: number, y: number): Point {
    const rect = this.box.getBoundingClientRect();
    return { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height };
  }

  /** From the box's own positions to the screen. */
  toClient(p: Point): Point {
    const rect = this.box.getBoundingClientRect();
    return { x: rect.left + p.x * rect.width, y: rect.top + p.y * rect.height };
  }
}

/** Plays the box: opening it at the start of a session and packing it at the end. */
export class ParcelBench {
  readonly parcel = new Parcel();
  /** True once the box has been opened or sent and the pause after it is over. */
  finished = false;

  private readonly view: ParcelView;
  private action: ParcelAction | null = null;
  private shownStep: ParcelStep | null = null;
  private last: Point | null = null;
  private onTape = false;
  private pauseLeft: number | null = null;

  constructor(
    root: HTMLElement,
    private readonly input: GestureInput,
    private readonly audio: AudioEngine,
    private readonly haptics: Haptics,
  ) {
    this.view = new ParcelView(root, this.parcel.tape.length);
  }

  set visible(visible: boolean) {
    this.view.visible = visible;
  }

  startOpening() {
    this.parcel.startOpening();
    this.view.packing = false;
    this.restart();
  }

  startPacking() {
    this.parcel.startPacking();
    this.view.packing = true;
    this.restart();
  }

  /** The material under the finger, for the modulation. */
  get material(): Material {
    const voice = VOICES[this.parcel.step];
    return voice ? TOOL_MATERIALS[voice] : defaultModulationParams.material;
  }

  /** The step to demonstrate, or null when the box has nothing left to do. */
  get verb(): ParcelStep | null {
    const { step } = this.parcel;
    return step === 'opened' || step === 'sealed' ? null : step;
  }

  /** Rises as the box is worked, so the ghost hand can tell someone stopped from someone working. */
  get progress() {
    const { parcel } = this;
    return parcel.tapeDone + parcel.flaps.reduce((sum, f) => sum + f, 0) + parcel.tissue;
  }

  /** Runs one frame and returns the gesture audio and haptics should hear. */
  step(gesture: GestureFrame, deltaTime: number): GestureFrame {
    this.showStepIfChanged();

    const { x, y } = this.input.clientPosition;
    const at = this.view.toBox(x, y);
    if (gesture.contact === 'began') this.begin(at);
    else if (isTouching(gesture)) this.drag(at);
    else if (this.action !== null) this.end();

    this.showStepIfChanged();
    this.view.update(this.parcel, this.action);
    this.stepPause(deltaTime);

    const voiced = (this.action === 'tape' && this.onTape) || this.action === 'tissue';
    return voiced ? gesture : { ...gesture, contact: 'none', speed: 0 };
  }

  /** A demonstration of the live step, on the box as it stands on screen now. */
  demo(): GhostMove[] {
    const drag = (from: Point, to: Point, seconds: number): GhostMove => ({
      seconds,
      fingers: (t) => [this.view.toClient({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) })],
    });
    const { step, flaps } = this.parcel;

    if (step === 'cut' || step === 'seal') return [drag({ x: 0.5, y: 0.04 }, { x: 0.5, y: 0.96 }, 1.3)];
    if (step === 'pull') return [drag({ x: 0.5, y: 0.65 }, { x: 0.5, y: 0.05 }, 0.9)];
    if (step === 'fold') return [drag({ x: 0.5, y: -0.45 }, { x: 0.5, y: 0.2 }, 0.9)];

    const goal = step === 'lift' ? 1 : 0;
    const moves: GhostMove[] = [];
    if (flaps[0] !== goal) moves.push(step === 'lift' ? drag({ x: 0.3, y: 0.5 }, { x: -0.1, y: 0.5 }, 0.7) : drag({ x: -0.15, y: 0.5 }, { x: 0.3, y: 0.5 }, 0.7));
    if (flaps[1] !== goal) moves.push(step === 'lift' ? drag({ x: 0.7, y: 0.5 }, { x: 1.1, y: 0.5 }, 0.7) : drag({ x: 1.15, y: 0.5 }, { x: 0.7, y: 0.5 }, 0.7));
    return moves;
  }

  private restart() {
    this.finished = false;
    this.action = null;
    this.shownStep = null;
    this.last = null;
    this.onTape = false;
    this.pauseLeft = null;
    this.view.update(this.parcel, null);
  }

  private begin(at: Point) {
    this.action = this.parcel.grab(at);
    this.last = null;
    if (this.action === 'tape') this.strokeTo(at);
  }

  private drag(at: Point) {
    if (this.action === 'tape') this.strokeTo(at);
    else if (this.action === 'flap') this.parcel.dragFlap(at);
    else if (this.action === 'tissue') this.parcel.dragTissue(at);
  }

  private end() {
    if (this.action === 'flap' && this.parcel.releaseFlap()) this.flapLanded();
    else if (this.action === 'tissue' && this.parcel.releaseTissue() && this.parcel.step === 'close') this.play('crease');
    this.action = null;
    this.onTape = false;
  }

  private strokeTo(at: Point) {
    this.onTape = this.parcel.strokeTape(this.last, at);
    this.last = at;
  }

  private flapLanded() {
    this.play(this.parcel.step === 'seal' ? 'box' : 'flap');
  }

  private play(name: 'flap' | 'box' | 'crease') {
    this.audio.play(name);
    this.haptics.pulse(name);
  }

  private showStepIfChanged() {
    const { step } = this.parcel;
    if (step === this.shownStep) return;
    this.shownStep = step;

    // A stroke that finished its step must not spill into the next one.
    if (this.action === 'tape') this.action = null;
    this.onTape = false;
    this.audio.setTool(VOICES[step] ?? null);

    if (step === 'opened') {
      this.pauseLeft = OPENED_PAUSE_S;
    } else if (step === 'sealed') {
      this.pauseLeft = SENT_PAUSE_S;
      this.view.send();
    }
  }

  private stepPause(deltaTime: number) {
    if (this.pauseLeft === null) return;
    this.pauseLeft -= deltaTime;
    if (this.pauseLeft <= 0) this.finished = true;
  }
}
