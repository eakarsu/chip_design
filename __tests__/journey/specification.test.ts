import { deriveRequirementsFromSpec, recommendTemplate } from '@/lib/journey/specification';

describe('specification helpers', () => {
  it('extracts requirement-like statements from a pasted specification', () => {
    const requirements = deriveRequirementsFromSpec(`
# Accelerator specification
- The accelerator shall support 8-bit signed operands.
- It must assert done exactly one cycle after the last product.
The host can clear the accumulator at any time.
`);

    expect(requirements.map((item) => item.id)).toEqual(['spec-1', 'spec-2', 'spec-3']);
    expect(requirements[0].description).toBe('The accelerator shall support 8-bit signed operands.');
    expect(requirements[1].description).toBe('It must assert done exactly one cycle after the last product.');
    expect(requirements[2].description).toBe('The host can clear the accumulator at any time.');
  });

  it('does not invent metrics and removes duplicates', () => {
    const requirements = deriveRequirementsFromSpec(
      'The FIFO must retain ordering.\nThe FIFO must retain ordering.\nThe FIFO must retain ordering.'
    );
    expect(requirements).toEqual([{ id: 'spec-1', description: 'The FIFO must retain ordering.' }]);
    expect(requirements[0]).not.toHaveProperty('metric');
    expect(requirements[0]).not.toHaveProperty('target');
  });

  it('respects the requested limit and skips too-short fragments', () => {
    const requirements = deriveRequirementsFromSpec(
      'The block shall expose a ready signal.\nThe block must accept one sample per cycle.\nThe block should report overflow.\nThe block will flush on reset.',
      3
    );
    expect(requirements).toHaveLength(3);
    expect(requirements.every((item) => item.description.length >= 12)).toBe(true);
  });

  it('recommends the closest published reference template', () => {
    expect(recommendTemplate('A ready/valid FIFO with backpressure')).toBe('fifo');
    expect(recommendTemplate('A signed multiply-accumulate datapath')).toBe('mac');
    expect(recommendTemplate('Compute the greatest common divisor of two integers')).toBe('gcd');
    expect(recommendTemplate('A power management unit with no reference match')).toBe('gcd');
  });
});
