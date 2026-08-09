import { glossaryTerms, knowledgeTopics, learningPaths } from '@/lib/knowledge/catalog';
import { search } from '@/lib/search';

describe('chip design academy catalog', () => {
  test('covers the complete lifecycle with unique, substantive modules', () => {
    expect(knowledgeTopics.length).toBeGreaterThanOrEqual(20);
    expect(new Set(knowledgeTopics.map(topic => topic.slug)).size).toBe(knowledgeTopics.length);
    expect(new Set(knowledgeTopics.map(topic => topic.order)).size).toBe(knowledgeTopics.length);
    const phases = new Set(knowledgeTopics.map(topic => topic.phase));
    for (const required of ['Foundations', 'Architecture', 'Front End', 'Physical Design', 'Signoff', 'Manufacturing', 'Validation']) {
      expect(phases.has(required)).toBe(true);
    }
    for (const topic of knowledgeTopics) {
      expect(topic.overview.length).toBeGreaterThanOrEqual(2);
      expect(topic.learningObjectives.length).toBeGreaterThanOrEqual(4);
      expect(topic.concepts.length).toBeGreaterThanOrEqual(6);
      expect(topic.workflow.length).toBeGreaterThanOrEqual(4);
      expect(topic.metrics.length).toBeGreaterThanOrEqual(3);
      expect(topic.signoffChecklist.length).toBeGreaterThanOrEqual(4);
      expect(topic.commonPitfalls.length).toBeGreaterThanOrEqual(4);
      expect(topic.tools.length).toBeGreaterThanOrEqual(3);
      expect(topic.practicalExercise.length).toBeGreaterThan(40);
    }
  });

  test('keeps related modules, tool links and role paths valid', () => {
    const slugs = new Set(knowledgeTopics.map(topic => topic.slug));
    for (const topic of knowledgeTopics) {
      topic.relatedSlugs.forEach(slug => expect(slugs.has(slug)).toBe(true));
      topic.tools.forEach(tool => expect(tool.href.startsWith('/')).toBe(true));
    }
    for (const path of learningPaths) {
      expect(path.topicSlugs.length).toBeGreaterThanOrEqual(5);
      path.topicSlugs.forEach(slug => expect(slugs.has(slug)).toBe(true));
    }
  });

  test('provides a broad, unique glossary and global knowledge search', () => {
    expect(glossaryTerms.length).toBeGreaterThanOrEqual(75);
    const normalizedTerms = glossaryTerms.map(entry => entry.term.toLowerCase());
    expect(new Set(normalizedTerms).size).toBe(normalizedTerms.length);
    expect(search('static timing analysis').some(result => result.type === 'knowledge')).toBe(true);
    expect(search('GDSII').some(result => result.type === 'glossary')).toBe(true);
    expect(search('secure boot').some(result => result.url.includes('hardware-security'))).toBe(true);
  });
});
