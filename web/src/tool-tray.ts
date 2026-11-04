import { STEP_TOOL, type StepId } from './core/bowl-repair';

const RING_RADIUS = 15;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const STEPS = Object.keys(STEP_TOOL) as Exclude<StepId, 'done'>[];

/** Temporary, until the Week 4 ghost hand shows each step instead. */
const HINTS: Record<StepId, string> = {
  clean: 'Scrape the old glue off every broken edge. Drag off the bowl to turn it.',
  align: 'Carry each shard to its gap. Twist with two fingers to square it up.',
  lacquer: 'Brush lacquer along every crack. Press harder for a wider line.',
  cure: 'Tap to close the lid.',
  gold: 'Tap or sweep gold dust over the lacquer.',
  polish: 'Rub the gold in slow, steady circles.',
  done: 'Mended.',
};

/** The flat UI over the bowl: tools and progress along the bottom, a one-line hint, the cure wait and "again". */
export class ToolTray {
  onSkipCure: () => void = () => {};
  onAgain: () => void = () => {};

  private readonly items: { root: HTMLElement; ring: SVGCircleElement }[] = [];
  private readonly hint = document.getElementById('hint')!;
  private readonly cure = document.getElementById('cure')!;
  private readonly again = document.getElementById('again')!;
  private shownStep: StepId | null = null;
  private shownProgress = -1;

  constructor(root: HTMLElement) {
    for (const step of STEPS) {
      const item = document.createElement('div');
      item.className = 'tool';
      item.innerHTML = `
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle class="track" cx="18" cy="18" r="${RING_RADIUS}" />
          <circle class="ring" cx="18" cy="18" r="${RING_RADIUS}" stroke-dasharray="${RING_LENGTH}" stroke-dashoffset="${RING_LENGTH}" transform="rotate(-90 18 18)" />
          <circle class="dot" cx="18" cy="18" r="5" />
        </svg>
        <span>${STEP_TOOL[step]}</span>`;
      root.append(item);
      this.items.push({ root: item, ring: item.querySelector('.ring')! });
    }
    root.hidden = false;
    this.hint.hidden = false;

    this.cure.addEventListener('click', () => this.onSkipCure());
    this.again.addEventListener('click', () => this.onAgain());
  }

  update(step: StepId, progress: number) {
    if (step !== this.shownStep) {
      this.shownStep = step;
      this.shownProgress = -1;
      this.hint.textContent = HINTS[step];
      this.again.hidden = step !== 'done';

      const live = STEPS.indexOf(step as Exclude<StepId, 'done'>);
      this.items.forEach((item, i) => {
        const finished = step === 'done' || i < live;
        item.root.classList.toggle('live', i === live);
        item.root.classList.toggle('finished', finished);
        item.ring.setAttribute('stroke-dashoffset', String(finished ? 0 : RING_LENGTH));
      });
    }

    const live = this.items[STEPS.indexOf(step as Exclude<StepId, 'done'>)];
    if (live && Math.abs(progress - this.shownProgress) > 0.002) {
      this.shownProgress = progress;
      live.ring.setAttribute('stroke-dashoffset', String(RING_LENGTH * (1 - progress)));
    }
  }

  showCure(visible: boolean) {
    this.cure.hidden = !visible;
  }
}
