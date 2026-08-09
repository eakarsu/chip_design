import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { diagnosticQuestions } from '@/lib/academy/catalog';
import { submitDiagnostic } from '@/lib/academy/store';

const schema = z.object({ answers: z.record(z.number().int().min(0).max(5)) }).strict();

export async function GET(request: Request) {
  return workspaceOperation(request, 'academy.diagnostic.questions', async () => ({
    questions: diagnosticQuestions.map(({ correctIndex: _correctIndex, explanation: _explanation, ...question }) => question),
  }));
}

export async function POST(request: Request) {
  return workspaceOperation(request, 'academy.diagnostic.submit', async (identity, requestId) => {
    const input = schema.parse(await request.json());
    if (Object.keys(input.answers).length !== diagnosticQuestions.length) throw new Error('Answer every diagnostic question before submitting');
    return { result: await submitDiagnostic(identity, input.answers, requestId) };
  }, ['admin', 'editor']);
}
