export type KnowledgeLevel = 'Foundation' | 'Intermediate' | 'Advanced';

export interface KnowledgeConcept {
  term: string;
  explanation: string;
}

export interface KnowledgeStep {
  title: string;
  detail: string;
  inputs: string[];
  outputs: string[];
}

export interface KnowledgeTool {
  label: string;
  href: string;
  purpose: string;
}

export interface KnowledgeReference {
  label: string;
  href: string;
  publisher: string;
  note: string;
}

export interface KnowledgeTopic {
  slug: string;
  order: number;
  title: string;
  shortTitle: string;
  phase: string;
  level: KnowledgeLevel;
  estimatedMinutes: number;
  description: string;
  overview: string[];
  learningObjectives: string[];
  concepts: KnowledgeConcept[];
  workflow: KnowledgeStep[];
  metrics: KnowledgeConcept[];
  signoffChecklist: string[];
  commonPitfalls: string[];
  practicalExercise: string;
  tools: KnowledgeTool[];
  references: KnowledgeReference[];
  relatedSlugs: string[];
  keywords: string[];
}

export interface LearningPath {
  slug: string;
  title: string;
  audience: string;
  description: string;
  outcome: string;
  topicSlugs: string[];
  accent: string;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
  category: string;
  related?: string[];
}
