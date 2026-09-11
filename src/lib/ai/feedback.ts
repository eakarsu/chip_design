import { desc } from 'drizzle-orm';
import { getDb } from '@/lib/db/connection';
import * as schema from '@/lib/db/schema';

export interface AiFeedbackInput {
  rating: 'up' | 'down';
  mode: 'chat' | 'review';
  model?: string;
  provider?: string;
  page?: string;
  question?: string;
  answer?: string;
  userId?: string;
  tenantId?: string;
}

export interface AiFeedbackSummary {
  total: number;
  up: number;
  down: number;
  byMode: Array<{ mode: string; up: number; down: number }>;
  recent: Array<{
    id: string;
    rating: string;
    mode: string;
    page?: string;
    model?: string;
    createdAt: string;
  }>;
}

const clip = (value: string | undefined, max: number): string => (value ?? '').slice(0, max);

export function recordAiFeedback(input: AiFeedbackInput): { id: string; createdAt: string } {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const id = `aif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  db.insert(schema.aiFeedback)
    .values({
      id,
      userId: input.userId ?? null,
      tenantId: input.tenantId ?? null,
      rating: input.rating,
      mode: input.mode,
      model: input.model ?? null,
      provider: input.provider ?? null,
      page: input.page ?? null,
      question: clip(input.question, 4_000),
      answer: clip(input.answer, 20_000),
      createdAt,
    })
    .run();
  return { id, createdAt };
}

export function aiFeedbackSummary(recentLimit = 20): AiFeedbackSummary {
  const rows = getDb().select().from(schema.aiFeedback).orderBy(desc(schema.aiFeedback.createdAt)).all();
  const up = rows.filter((row) => row.rating === 'up').length;
  const byMode = new Map<string, { mode: string; up: number; down: number }>();
  for (const row of rows) {
    const entry = byMode.get(row.mode) ?? { mode: row.mode, up: 0, down: 0 };
    if (row.rating === 'up') entry.up += 1;
    else entry.down += 1;
    byMode.set(row.mode, entry);
  }
  return {
    total: rows.length,
    up,
    down: rows.length - up,
    byMode: [...byMode.values()],
    recent: rows.slice(0, recentLimit).map((row) => ({
      id: row.id,
      rating: row.rating,
      mode: row.mode,
      page: row.page ?? undefined,
      model: row.model ?? undefined,
      createdAt: row.createdAt,
    })),
  };
}
