/** @jest-environment node */
import { copilotKnowledge } from '@/lib/ai/copilotKnowledge';

it('grounds governance questions in the actual workspace and operations workflows', () => {
  const result = copilotKnowledge('How do I request ECO approval?', '/workspace');
  expect(result.sources.some((item) => item.href === '/workspace')).toBe(true);
  expect(result.context).toContain('draft → review → approved/rejected');
  expect(result.context).toContain('a suite passes only when every point passes');
});

it('finds learning content and actual tool links for questions beyond the old preset topics', () => {
  const result = copilotKnowledge('Explain post-silicon validation and bring-up debugging');
  expect(result.sources.some((item) => item.href === '/learn/post-silicon-validation')).toBe(true);
  expect(result.sources).toHaveLength(new Set(result.sources.map((item) => item.href)).size);
  expect(result.sources.every((item) => item.href.startsWith('/') && !item.href.startsWith('//'))).toBe(true);
});

it('provides app knowledge without pretending to observe a live project or run tools', () => {
  const result = copilotKnowledge('How do I submit my own RTL?', '/workspace/execution/new');
  expect(result.sources.some((item) => item.href === '/workspace/execution/new')).toBe(true);
  expect(result.context).toContain('not live project state');
  expect(result.context).toContain('Chat cannot run tools, change records or grant approvals');
});
