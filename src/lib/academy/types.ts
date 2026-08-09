export type AcademyStatus = 'not-started' | 'in-progress' | 'passed' | 'needs-review';

export interface AcademyRubricCriterion {
  id: string;
  label: string;
  description: string;
  points: number;
}

export interface AcademyLabDefinition {
  slug: string;
  topicSlug: string;
  title: string;
  level: 'Foundation' | 'Intermediate' | 'Advanced';
  estimatedMinutes: number;
  objective: string;
  instructions: string[];
  evidenceRequirements: string[];
  starterContent: string;
  editorLanguage: 'systemverilog' | 'sdc' | 'markdown';
  toolLinks: Array<{ label: string; href: string }>;
  rubric: AcademyRubricCriterion[];
}

export interface AcademyCriterionResult extends AcademyRubricCriterion {
  earned: number;
  passed: boolean;
  feedback: string;
}

export interface AcademyGrade {
  score: number;
  passed: boolean;
  status: AcademyStatus;
  summary: string;
  strengths: string[];
  improvements: string[];
  criteria: AcademyCriterionResult[];
  measurements: Record<string, string | number | boolean>;
}

export interface AcademySubmission {
  id: string;
  labSlug: string;
  topicSlug: string;
  response: string;
  evidence: string[];
  grade: AcademyGrade;
  attempt: number;
  createdAt: string;
}

export interface AcademyProgress {
  topicSlug: string;
  status: AcademyStatus;
  bestScore: number;
  attempts: number;
  completedAt?: string;
  updatedAt: string;
}

export interface AcademyDiagnosticQuestion {
  id: string;
  domain: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AcademyTutorBrief {
  headline: string;
  masteryAssessment: string;
  explanation: string;
  misconceptions: string[];
  progressiveHints: string[];
  evidenceChecks: string[];
  nextAction: string;
  solutionBoundary: string;
  confidence: number;
}

export interface AcademyDashboard {
  enrollment: {
    pathSlug: string;
    status: string;
    diagnosticScore: number | null;
    startedAt: string;
  };
  summary: {
    totalModules: number;
    completedModules: number;
    inProgressModules: number;
    averageScore: number;
    completionPct: number;
  };
  progress: AcademyProgress[];
  submissions: AcademySubmission[];
  labs: AcademyLabDefinition[];
  paths: Array<{ slug: string; title: string; description: string; modules: number }>;
  capstone: AcademyCapstone | null;
}

export interface AcademyCapstone {
  id: string;
  title: string;
  specification: string;
  architecture: string;
  verificationPlan: string;
  evidence: string[];
  status: 'draft' | 'submitted' | 'approved' | 'revision-required';
  score: number;
  feedback: string;
  updatedAt: string;
}
