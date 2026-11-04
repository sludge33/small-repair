import type { BowlRepair, StepQuality } from './bowl-repair';

/** The first letter's words. Placeholder until the letters are playtested, which the design doc asks for separately. */

export interface Letter {
  greeting: string;
  paragraphs: string[];
  signature: string;
}

/** At or above this share of careful work, the reply mentions how the repair looks. Unjudged: needs real strokes. */
const CAREFUL_SHARE = 0.5;

const CAREFUL_LINE = 'The gold catches the light at breakfast.';
const LOOSE_LINE = 'It holds tea again.';

export const OWNER_NOTE: Letter = {
  greeting: 'Dear repairer,',
  paragraphs: [
    'This is the bowl I have eaten my rice from for forty-one years. Nothing special. My sister bought it from a market stall.',
    'Last Sunday my grandson Theo helped me clear the table and it slipped. He has been very quiet about it since. I told him bowls can be mended.',
    'Please make me right about that.',
  ],
  signature: 'Hana',
};

const share = ({ clean, total }: StepQuality) => (total > 0 ? clean / total : null);

/** How much of the repair stayed in the clean bands, 0–1. Each step counts the same, however long its strokes ran. */
export function carefulShare(repair: Pick<BowlRepair, 'quality' | 'seatedClean'>) {
  const shares = Object.values(repair.quality).map(share);
  shares.push(repair.seatedClean.filter(Boolean).length / repair.seatedClean.length);
  const counted = shares.filter((s) => s !== null);
  return counted.reduce((sum, s) => sum + s, 0) / counted.length;
}

/** The letter back. One line follows how careful the repair was; it is never a grade. */
export function replyLetter(careful: number): Letter {
  return {
    greeting: 'Dear repairer,',
    paragraphs: [
      `The bowl came home on Tuesday. I unwrapped it at the kitchen table with Theo watching over my shoulder, and he ran his thumb along each seam before he would believe it. ${
        careful >= CAREFUL_SHARE ? CAREFUL_LINE : LOOSE_LINE
      }`,
      'He asked if it was still the same bowl. I said it is the same bowl with a better story, and he seemed satisfied with that.',
      'He carries it to the table himself now, with both hands, very slowly. We are all eating later than we used to.',
      'Thank you.',
    ],
    signature: 'Hana',
  };
}
