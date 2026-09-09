'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { adaptivePractice } from '@/lib/journey/adaptive';
import type { DesignRevision, JourneyBundle } from '@/lib/journey/types';

export default function PracticePanel({
  revision,
  bundle,
  busy,
  dirty,
  action,
}: {
  revision: DesignRevision;
  bundle: JourneyBundle;
  busy: boolean;
  dirty: boolean;
  action: (body: Record<string, unknown>, notice: string) => Promise<unknown>;
}) {
  const [hint, setHint] = useState<Record<string, number>>({});
  const [assessmentId, setAssessmentId] = useState('');
  const [score, setScore] = useState(10);
  const [feedback, setFeedback] = useState('');
  const practice = adaptivePractice(
    revision.templateId,
    bundle.runs.filter((item) => item.createdBy === bundle.userId),
    bundle.assessments.filter((item) => item.userId === bundle.userId)
  );
  const pending = bundle.assessments.filter((item) => item.explanationScore === null && item.userId !== bundle.userId);
  const selected = pending.find((item) => item.id === assessmentId);
  return (
    <Stack gap={3}>
      <Alert
        severity="info"
        action={
          <Button component={Link} href={`/learn/${practice.lesson}`}>
            Lesson
          </Button>
        }
      >
        {practice.reason}
      </Alert>
      <Typography color="text.secondary">
        Each challenge creates a new revision with a deliberate defect. Existing revisions and runs remain in the
        project history. Repair it, execute the fixed simulation suite, and submit an explanation to record mastery.
      </Typography>
      {practice.challenges.map((item) => (
        <Paper key={item.id} variant="outlined" sx={{ p: 3 }}>
          <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
            <Typography variant="h6" sx={{ flex: 1 }}>
              {item.title}
            </Typography>
            <Chip
              size="small"
              color={item.solved ? 'success' : item.recommended ? 'primary' : 'default'}
              label={item.solved ? 'Demonstrated' : item.recommended ? 'Recommended' : 'Available'}
            />
            <Chip size="small" label={`${item.attempts} run${item.attempts === 1 ? '' : 's'}`} />
          </Stack>
          <Typography sx={{ mt: 1 }}>{item.instruction}</Typography>
          {!item.prerequisitesMet && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Suggested preparation: {item.prerequisites.join(', ')}. You can still attempt this challenge.
            </Typography>
          )}
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ my: 2 }}>
            <Button
              variant="contained"
              disabled={!bundle.canEdit || busy || dirty || revision.id !== bundle.revision?.id}
              onClick={() =>
                void action(
                  { action: 'challenge', challengeId: item.id, baseRevisionId: revision.id },
                  'Challenge revision saved. Run the fixed simulation to reproduce the defect.'
                )
              }
            >
              Start challenge
            </Button>
            <Button
              disabled={(hint[item.id] ?? 0) >= 3}
              onClick={() => setHint((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }))}
            >
              Reveal next hint
            </Button>
            <Button component={Link} href={`/learn/${item.lesson}`}>
              Read lesson
            </Button>
          </Stack>
          {item.hints.slice(0, hint[item.id] ?? 0).map((text, index) => (
            <Alert key={index} severity="info" sx={{ mt: 1 }}>
              Hint {index + 1}: {text}
            </Alert>
          ))}
        </Paper>
      ))}
      {!practice.challenges.length && (
        <Alert severity="info">
          This template has no seeded challenge yet. Its fixed signed-arithmetic and valid-cycle checks provide a
          starting point for your own regressions.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6">Executed lab history</Typography>
        <Stack gap={2} sx={{ mt: 2 }}>
          {bundle.assessments.length ? (
            bundle.assessments.map((item) => (
              <Box key={item.id}>
                <Typography fontWeight={700}>
                  {item.technicalPassed ? 'Technical checks passed' : 'Technical revision needed'} ·{' '}
                  {item.challengeId || 'Reference lab'}
                </Typography>
                <Typography variant="body2">
                  Correctness {item.correctness}/60 · Reproducibility {item.reproducibility}/25 · Explanation{' '}
                  {item.explanationScore === null ? 'awaiting independent review' : `${item.explanationScore}/15`}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  {item.feedback}
                </Typography>
              </Box>
            ))
          ) : (
            <Typography color="text.secondary">Grade a completed reference run to start recording progress.</Typography>
          )}
        </Stack>
      </Paper>
      {bundle.role === 'admin' && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6">Instructor explanation review</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Score reasoning independently from executed correctness. Review assumptions, the observed cause, why the fix
            works, and its remaining limitations.
          </Typography>
          <Stack gap={2} sx={{ mt: 2 }}>
            <TextField
              select
              label="Pending explanation by another learner"
              value={assessmentId}
              onChange={(event) => setAssessmentId(event.target.value)}
            >
              {pending.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.userId} · {item.runId.slice(0, 8)}
                </MenuItem>
              ))}
            </TextField>
            {selected && <Alert severity="info">{selected.explanation}</Alert>}
            <TextField
              type="number"
              label="Explanation score /15"
              value={score}
              onChange={(event) => setScore(Number(event.target.value))}
              inputProps={{ min: 0, max: 15 }}
            />
            <TextField
              multiline
              minRows={3}
              label="Instructor feedback"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
            <Button
              disabled={busy || !selected || feedback.trim().length < 20 || score < 0 || score > 15}
              onClick={() =>
                void action(
                  { action: 'review', assessmentId, score, feedback },
                  'Independent explanation review recorded.'
                )
              }
            >
              Record review
            </Button>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
