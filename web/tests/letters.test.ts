import { describe, expect, it } from 'vitest';
import { carefulShare, OWNER_NOTE, replyLetter, type Letter } from '../src/core/letters';

const words = (letter: Letter) => letter.paragraphs.join(' ').split(/\s+/).length;
const text = (letter: Letter) => letter.paragraphs.join(' ');

function repairWith(lengths: Partial<Record<'clean' | 'lacquer' | 'gold' | 'polish', [number, number]>>, seatedClean = [false, false, false]) {
  const empty = { clean: 0, total: 0 };
  const quality = { clean: empty, lacquer: empty, gold: empty, polish: empty };
  for (const [step, [clean, total]] of Object.entries(lengths)) quality[step as keyof typeof quality] = { clean, total };
  return { quality, seatedClean };
}

describe('letter lengths', () => {
  it('keeps the note in to the spec 40–80 words', () => {
    expect(words(OWNER_NOTE)).toBeGreaterThanOrEqual(40);
    expect(words(OWNER_NOTE)).toBeLessThanOrEqual(80);
  });

  it.each([0, 1])('keeps the reply to the spec 60–120 words at careful share %d', (careful) => {
    expect(words(replyLetter(careful))).toBeGreaterThanOrEqual(60);
    expect(words(replyLetter(careful))).toBeLessThanOrEqual(120);
  });
});

describe('the reply', () => {
  it('changes one line with how careful the repair was', () => {
    expect(text(replyLetter(0.9))).toContain('The gold catches the light at breakfast.');
    expect(text(replyLetter(0.9))).not.toContain('It holds tea again.');
    expect(text(replyLetter(0.1))).toContain('It holds tea again.');
    expect(text(replyLetter(0.1))).not.toContain('The gold catches the light at breakfast.');
  });

  it('never grades the repair in numbers', () => {
    expect(text(replyLetter(0.1))).not.toMatch(/\d/);
  });
});

describe('carefulShare', () => {
  it('counts each step the same, however long its strokes ran', () => {
    const share = carefulShare(repairWith({ clean: [10, 10], polish: [0, 5000] }, [false, false, false]));
    expect(share).toBeCloseTo(1 / 3);
  });

  it('counts shards lined up by hand', () => {
    expect(carefulShare(repairWith({}, [true, true, true]))).toBe(1);
    expect(carefulShare(repairWith({}, [true, false, false]))).toBeCloseTo(1 / 3);
  });

  it('skips a step with no strokes rather than dividing by zero', () => {
    expect(carefulShare(repairWith({ gold: [5, 5] }, [true, true, true]))).toBe(1);
  });
});
