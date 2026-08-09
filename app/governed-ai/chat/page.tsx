'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Box, Button, Chip, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { ArrowBack, Gavel, Lock, SmartToy } from '@mui/icons-material';
import AICopilot from '@/components/AICopilot';
import type { WorkspaceBundle } from '@/lib/commercial/types';
import { buildLifecycleChatPrompt, buildLifecycleProfile } from '@/lib/commercial/lifecycle';

function GovernedAIChatContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') ?? '';
  const phaseId = searchParams.get('phase') ?? '';
  const [workspace, setWorkspace] = useState<WorkspaceBundle | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/workspace/bootstrap')
      .then(async response => {
        if (!response.ok) throw new Error('Workspace context unavailable');
        return response.json();
      })
      .then(data => { if (active) setWorkspace(data.workspace); })
      .catch(() => { if (active) setWorkspace(null); });
    return () => { active = false; };
  }, [phaseId, projectId]);

  const profile = workspace ? buildLifecycleProfile(workspace, projectId || undefined) : null;
  const phase = profile?.phases.find(item => item.id === phaseId);
  const initialPrompt = profile && phaseId ? buildLifecycleChatPrompt(profile, phaseId) : undefined;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" alignItems="center" gap={1}>
            <SmartToy color="primary" />
            <Typography variant="overline" color="primary" fontWeight={900}>GOVERNED AI</Typography>
          </Stack>
          <Typography component="h1" variant="h3" fontWeight={900}>Engineering chat</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 820 }}>
            Have a normal multi-turn conversation with the chip-design assistant. Use a quick prompt or write your own request, add evidence and refine the answer through follow-up messages.
          </Typography>
        </Box>
        <Stack direction="row" gap={1} alignItems="flex-start" flexWrap="wrap" useFlexGap>
          <Button component={Link} href={`/governed-ai/lifecycle${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}${phaseId ? `#phase-${encodeURIComponent(phaseId)}` : ''}`} startIcon={<ArrowBack />} variant="outlined">Back to lifecycle</Button>
          <Chip icon={<Lock />} label="ZDR routing policy" color="success" variant="outlined" />
          <Chip icon={<Gavel />} label="Human signoff required" variant="outlined" />
        </Stack>
      </Stack>
      <Alert severity="info" sx={{ mb: 2 }}>
        AI guidance is advisory. Verify claims against retained design reports, approved constraints and signoff evidence before making a release decision.
      </Alert>
      {projectId && phaseId && !workspace && <Alert severity="warning" sx={{ mb: 2 }}>Loading the selected project and lifecycle evidence…</Alert>}
      {profile && phase && <Alert severity="success" sx={{ mb: 2 }} action={<Button component={Link} href={`/governed-ai/lifecycle?projectId=${encodeURIComponent(profile.project.id)}`} color="inherit">Open lifecycle</Button>}>
        Context loaded: <strong>{profile.project.name}</strong> · Phase {phase.order}: {phase.title} · {phase.progress}% evidence complete. The review prompt below contains retained and missing evidence.
      </Alert>}
      <AICopilot
        embedded
        title={phase ? `${phase.order}. ${phase.title}` : 'Governed chip-design chat'}
        initialPrompt={initialPrompt}
        designContext={profile && phase ? {
          currentAlgorithm: phase.title,
          currentParams: { projectId: profile.project.id, phaseId: phase.id, evidenceProgress: phase.progress },
          lastResult: { completedEvidence: phase.completedEvidence, missingEvidence: phase.missingEvidence },
        } : undefined}
        lifecycleContext={profile ? {
          projectId: profile.project.id,
          phases: profile.phases.map(item => ({ id: item.id, order: item.order, title: item.title, status: item.status, progress: item.progress, route: item.route, deliverables: item.deliverables, tools: item.tools })),
        } : undefined}
      />
    </Container>
  );
}

export default function GovernedAIChatPage() {
  return <Suspense fallback={<Container sx={{ py: 8 }}><CircularProgress /></Container>}><GovernedAIChatContent /></Suspense>;
}
