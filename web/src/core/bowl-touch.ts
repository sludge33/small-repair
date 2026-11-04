import type { StepId } from './bowl-repair';

export type TouchAction = 'stroke' | 'hold' | 'lid' | 'orbit';

/** What a new touch does. Anything that misses the live step's target turns the bowl, so a stray touch is never wasted. */
export function touchAction(step: StepId, onBowl: boolean, onShard: boolean): TouchAction {
  if (step === 'cure') return 'lid';
  if (step === 'done') return 'orbit';
  if (step === 'align') return onShard ? 'hold' : 'orbit';
  return onBowl ? 'stroke' : 'orbit';
}
