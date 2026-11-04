import { ghostPose, type GhostMove } from './core/ghost';

const FINGER_COUNT = 2;
/** Where the fingertip is in the hand's drawing, in pixels at its drawn size. */
const TIP_X = 18;
const TIP_Y = 5;

/** The translucent hand that shows a verb, drawn over everything and never in the way of a touch. */
export class GhostHand {
  private readonly hand: HTMLElement;
  private readonly touches: HTMLElement[] = [];
  private moves: GhostMove[] | null = null;
  private elapsed = 0;

  constructor(private readonly root: HTMLElement) {
    for (let i = 0; i < FINGER_COUNT; i++) {
      const touch = document.createElement('div');
      touch.className = 'ghost-touch';
      root.append(touch);
      this.touches.push(touch);
    }

    this.hand = document.createElement('div');
    this.hand.className = 'ghost-hand';
    this.hand.innerHTML = `
      <svg viewBox="0 0 64 96" aria-hidden="true">
        <path d="M18 12 V54 M30 42 V60 M41 45 V62 M52 50 V64" />
        <rect x="11" y="52" width="48" height="40" rx="15" />
      </svg>`;
    root.append(this.hand);
  }

  play(moves: GhostMove[]) {
    this.moves = moves;
    this.elapsed = 0;
    this.root.hidden = false;
  }

  stop() {
    this.moves = null;
    this.root.hidden = true;
  }

  step(deltaTime: number) {
    if (!this.moves) return;
    this.elapsed += deltaTime;

    const pose = ghostPose(this.moves, this.elapsed);
    if (!pose) {
      this.stop();
      return;
    }

    this.root.style.opacity = String(pose.opacity);
    const [first] = pose.fingers;
    this.hand.style.transform = `translate(${first.x - TIP_X}px, ${first.y - TIP_Y}px) scale(${pose.down ? 0.94 : 1})`;
    this.touches.forEach((touch, i) => {
      const finger = pose.fingers[i];
      touch.hidden = !finger || !pose.down;
      if (finger) touch.style.transform = `translate(${finger.x}px, ${finger.y}px)`;
    });
  }
}
