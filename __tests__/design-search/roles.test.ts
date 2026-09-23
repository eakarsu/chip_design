/** @jest-environment node */
import { generateJSONCompletion } from '@/lib/openrouter';
import { researchDirections } from '@/lib/design-search/roles';
import type { DesignRevision } from '@/lib/journey/types';

jest.mock('@/lib/openrouter', () => ({ generateJSONCompletion: jest.fn() }));

const originalModel = process.env.OPENROUTER_MODEL;
beforeAll(() => { process.env.OPENROUTER_MODEL = 'approved/research'; });
afterAll(() => { process.env.OPENROUTER_MODEL = originalModel; });

const input = {
  revision: { topModule: 'gcd', templateId: 'gcd', specification: 'Compute GCD with a fixed interface.',
    requirements: [] } as unknown as DesignRevision,
  objective: 'min_area' as const,
  literature: [{ id: 'known-source', title: 'Relevant source', url: 'https://example.org/source',
    abstract: 'A source for a bounded experiment.', origin: 'Reference' as const }],
};

it('accepts provider question objects without weakening source citation validation', async () => {
  (generateJSONCompletion as jest.Mock).mockResolvedValueOnce({
    brief: 'Test area under a locked source and the same physical flow.',
    sourceIds: ['known-source'],
    questions: Array.from({ length: 5 }, (_, index) => ({ question: `Does candidate ${index} improve measured area?` })),
    explanation: 'An optional provider field',
  });
  const result = await researchDirections(input);
  expect(result.brief.sourceIds).toEqual(['known-source']);
  expect(result.brief.questions).toHaveLength(4);

  (generateJSONCompletion as jest.Mock).mockResolvedValueOnce({
    brief: 'Test area under a locked source and the same physical flow.',
    sourceIds: ['invented-source'], questions: [],
  });
  await expect(researchDirections(input)).rejects.toThrow(/unavailable source/);
});
