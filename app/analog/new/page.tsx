'use client';

/**
 * New analog design: requirement entry, completeness review and project
 * creation. Creating the project requires a signed-in workspace session.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Container, Stack, Typography } from '@mui/material';
import RequirementForm from '@/components/analog/RequirementForm';
import { apiPost, isUnauthorized } from '@/components/analog/api';
import type { ProjectRecord, RequirementsInput } from '@/components/analog/types';

export default function NewAnalogDesignPage() {
  const router = useRouter();

  const createProject = async (requirements: RequirementsInput) => {
    try {
      const project = await apiPost<ProjectRecord>('/api/analog/projects', {
        name: requirements.name,
        requirements,
      });
      router.push(`/analog/${project.id}`);
    } catch (error) {
      if (isUnauthorized(error)) throw new Error('Sign in to create and save analog projects.');
      throw error;
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems="flex-start">
        <Stack spacing={1}>
          <Typography variant="overline" color="primary">
            Analog power design
          </Typography>
          <Typography variant="h3" fontWeight={800}>
            New analog design
          </Typography>
          <Typography color="text.secondary" maxWidth={800}>
            Enter the buck-converter operating conditions, review the derived conditions and missing items, then
            create the project. The workspace guides you through IC selection, sizing, simulation, schematic, PCB
            review and the AI challenge.
          </Typography>
        </Stack>
        <Button component={Link} href="/analog" variant="outlined">
          All designs
        </Button>
      </Stack>

      <Alert severity="info" sx={{ mt: 3 }}>
        Reviewing the requirements calls the calculation endpoint — no model is involved. Creating the project stores
        it in your workspace; the governed AI review later needs a signed-in session.
      </Alert>

      <Stack sx={{ mt: 3 }}>
        <RequirementForm
          primaryLabel="Create project"
          primarySuccessMessage="Project created."
          onPrimaryAction={createProject}
        />
      </Stack>
    </Container>
  );
}
