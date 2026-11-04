import type { GhostMove } from './core/ghost';
import type { Letter } from './core/letters';

/** The flat paper over everything else: the owner's note, the envelope that comes back, and the letter inside it. */
export class LetterDesk {
  /** Called when the envelope is opened, so the sounds can play from the tap that unlocks them. */
  onOpenEnvelope: () => void = () => {};

  private readonly envelope: HTMLButtonElement;
  private readonly letter: HTMLElement;
  private readonly done: HTMLButtonElement;
  private onDone: () => void = () => {};
  private waitingLetter: { letter: Letter; doneLabel: string } | null = null;

  constructor(private readonly root: HTMLElement) {
    this.envelope = root.querySelector('#envelope')!;
    this.letter = root.querySelector('#letter')!;
    this.done = root.querySelector('#letter-done')!;

    this.envelope.addEventListener('click', () => {
      this.onOpenEnvelope();
      const { letter, doneLabel } = this.waitingLetter!;
      this.waitingLetter = null;
      this.showLetter(letter, doneLabel);
    });
    this.done.addEventListener('click', () => {
      this.hide();
      this.onDone();
    });
  }

  /** Shows an open letter, over whatever is behind it. */
  showNote(note: Letter, doneLabel: string, onDone: () => void) {
    this.onDone = onDone;
    this.root.classList.remove('arrival');
    this.root.hidden = false;
    this.showLetter(note, doneLabel);
  }

  /** Shows a sealed envelope, which opens to the letter on a tap. */
  showEnvelope(letter: Letter, doneLabel: string, onDone: () => void) {
    this.onDone = onDone;
    this.waitingLetter = { letter, doneLabel };
    this.root.classList.add('arrival');
    this.root.hidden = false;
    this.envelope.hidden = false;
    this.letter.hidden = true;
    this.done.hidden = true;
  }

  hide() {
    this.root.hidden = true;
  }

  /** The step to demonstrate. Reading a letter is never hurried, so only the sealed envelope has one. */
  get verb() {
    return !this.root.hidden && !this.envelope.hidden ? 'envelope' : null;
  }

  demo(): GhostMove[] {
    const rect = this.envelope.getBoundingClientRect();
    const middle = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    return [{ seconds: 0.2, fingers: () => [middle] }];
  }

  private showLetter(letter: Letter, doneLabel: string) {
    this.envelope.hidden = true;
    this.letter.hidden = false;
    this.done.hidden = false;
    this.done.textContent = doneLabel;

    const lines = [letter.greeting, ...letter.paragraphs].map((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      return p;
    });
    const signature = document.createElement('p');
    signature.className = 'signature';
    signature.textContent = letter.signature;
    this.letter.replaceChildren(...lines, signature);
    this.letter.scrollTop = 0;
  }
}
