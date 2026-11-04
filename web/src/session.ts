import type { AudioEngine } from './audio/audio';
import type { BowlRepair } from './core/bowl-repair';
import { GhostTutor } from './core/ghost';
import { isTouching, type GestureFrame } from './core/gesture';
import { carefulShare, OWNER_NOTE, replyLetter } from './core/letters';
import type { Material } from './core/modulation';
import type { GhostHand } from './ghost-hand';
import type { Haptics } from './haptics';
import type { LetterDesk } from './letter-desk';
import type { ParcelBench } from './parcel-bench';
import type { ToolTray } from './tool-tray';
import type { Workbench } from './workbench';

export type Stage = 'unbox' | 'note' | 'repair' | 'wrap' | 'reply' | 'finished';

/** Runs one parcel from arrival to reply: which stage is live, and when the ghost hand steps in. */
export class Session {
  stage: Stage = 'unbox';

  private readonly tutor = new GhostTutor();
  private shownVerb: string | null = null;

  constructor(
    private readonly bench: ParcelBench,
    private readonly desk: LetterDesk,
    private readonly workbench: Workbench,
    private readonly repair: BowlRepair,
    private readonly tray: ToolTray,
    private readonly ghost: GhostHand,
    private readonly audio: AudioEngine,
    private readonly haptics: Haptics,
    private readonly again: HTMLElement,
  ) {
    tray.onWrap = () => this.goTo('wrap');
    again.addEventListener('click', () => {
      this.workbench.restart();
      this.goTo('unbox');
    });
    desk.onOpenEnvelope = () => {
      this.audio.wake();
      this.audio.play('tear');
      this.haptics.pulse('tear');
      window.setTimeout(() => this.audio.play('unfold'), 260);
    };
    this.goTo('unbox');
  }

  /** Whether the 3D bowl is on screen and worth drawing. */
  get bowlOnScreen() {
    return this.stage === 'repair' || this.stage === 'finished';
  }

  /** The material of whatever is being worked, for the modulation. */
  get material(): Material {
    return this.usesBox ? this.bench.material : this.workbench.material;
  }

  /** Runs one frame and returns the gesture audio and haptics should hear. */
  step(gesture: GestureFrame, deltaTime: number): GestureFrame {
    const voiced = this.stepStage(gesture, deltaTime);
    this.stepGhost(gesture, deltaTime);
    return voiced;
  }

  private stepStage(gesture: GestureFrame, deltaTime: number): GestureFrame {
    if (this.usesBox) {
      const voiced = this.bench.step(gesture, deltaTime);
      if (this.bench.finished) this.goTo(this.stage === 'unbox' ? 'note' : 'reply');
      return voiced;
    }
    if (this.bowlOnScreen) return this.workbench.step(gesture, deltaTime);
    return { ...gesture, contact: 'none', speed: 0 };
  }

  private stepGhost(gesture: GestureFrame, deltaTime: number) {
    const touching = isTouching(gesture);
    const verb = this.verb;
    if (touching || verb === null || verb !== this.shownVerb) this.ghost.stop();
    this.shownVerb = verb;

    if (this.tutor.step(verb, this.progress, touching, deltaTime)) this.ghost.play(this.demo());
    this.ghost.step(deltaTime);
  }

  private get verb() {
    if (this.usesBox) return this.bench.verb;
    if (this.stage === 'repair') return this.workbench.verb;
    if (this.stage === 'reply') return this.desk.verb;
    return null;
  }

  private get progress() {
    if (this.usesBox) return this.bench.progress;
    return this.stage === 'repair' ? this.repair.progress() : 0;
  }

  private demo() {
    if (this.usesBox) return this.bench.demo();
    return this.stage === 'repair' ? this.workbench.demo() : this.desk.demo();
  }

  private get usesBox() {
    return this.stage === 'unbox' || this.stage === 'wrap';
  }

  private goTo(stage: Stage) {
    this.stage = stage;
    this.bench.visible = stage === 'unbox' || stage === 'note' || stage === 'wrap';
    this.tray.show(stage === 'repair');
    this.again.hidden = stage !== 'finished';
    this.desk.hide();

    if (stage === 'unbox') this.bench.startOpening();
    else if (stage === 'wrap') this.bench.startPacking();
    else if (stage !== 'repair') this.audio.setTool(null);

    if (stage === 'note') {
      this.desk.showNote(OWNER_NOTE, 'Set it down', () => this.goTo('repair'));
    } else if (stage === 'reply') {
      this.desk.showEnvelope(replyLetter(carefulShare(this.repair)), 'Fold it away', () => this.goTo('finished'));
    }
  }
}
