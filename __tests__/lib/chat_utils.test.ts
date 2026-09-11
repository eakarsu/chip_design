import { splitFollowUps } from '@/components/ai/CopilotProvider';
import { suggestedPrompts } from '@/lib/ai/copilotKnowledge';

describe('splitFollowUps', () => {
  it('extracts and removes a trailing suggestion line', () => {
    const { content, followUps } = splitFollowUps('Answer body.\n\nFOLLOWUPS: One? | Two? | Three?');
    expect(content).toBe('Answer body.');
    expect(followUps).toEqual(['One?', 'Two?', 'Three?']);
  });

  it('caps suggestions at three and trims blanks', () => {
    const { followUps } = splitFollowUps('Answer.\nFOLLOWUPS: One? | | Two? | Three? | Four?');
    expect(followUps).toEqual(['One?', 'Two?', 'Three?']);
  });

  it('leaves answers without the trailer intact', () => {
    const { content, followUps } = splitFollowUps('Plain answer.');
    expect(content).toBe('Plain answer.');
    expect(followUps).toEqual([]);
  });
});

describe('suggestedPrompts', () => {
  it('returns page-aware prompts for catalog routes', () => {
    const prompts = suggestedPrompts('/workspace');
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toContain('Design Workspace');
  });

  it('falls back to the app-wide starters for unknown routes', () => {
    const prompts = suggestedPrompts('/not-a-real-page');
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toBe('What can I do in this app?');
  });
});
