'use client';

/**
 * Analog project workspace: one tab per workflow stage.
 *
 * The project is loaded from the governed API on mount. Each tab posts its
 * calculations to the compute routes and persists results back with PUT, so a
 * reload restores the recorded evidence.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Container, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { ApiError, apiGet, apiPut } from '@/components/analog/api';
import BomTable from '@/components/analog/BomTable';
import IcTable from '@/components/analog/IcTable';
import PcbChecklistPanel from '@/components/analog/PcbChecklistPanel';
import RequirementForm from '@/components/analog/RequirementForm';
import ReviewPanel from '@/components/analog/ReviewPanel';
import RunsPanel from '@/components/analog/RunsPanel';
import SchematicPanel from '@/components/analog/SchematicPanel';
import SimulationPanel from '@/components/analog/SimulationPanel';
import type {
  AiReviewResult,
  AnalogProject,
  BuckDesign,
  IcCatalogEntry,
  PcbCheck,
  ProjectPatch,
  ProjectRecord,
  RequirementsInput,
  SimulationResult,
} from '@/components/analog/types';
import { ProjectStatusChip } from '@/components/analog/ui';
import { formatDateTime } from '@/components/analog/utils';

const TAB_LABELS = [
  'Requirements',
  'IC selection',
  'Components',
  'Simulation',
  'Schematic',
  'PCB review',
  'AI review',
  'Runs',
];

const STATUS_ORDER: AnalogProject['status'][] = ['draft', 'designed', 'simulated', 'reviewed', 'approved'];

function advanceStatus(current: AnalogProject['status'], target: AnalogProject['status']): AnalogProject['status'] {
  return STATUS_ORDER.indexOf(current) >= STATUS_ORDER.indexOf(target) ? current : target;
}

export default function AnalogProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; status: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [tab, setTab] = useState(0);
  const [visited, setVisited] = useState<number[]>([0]);
  const [tuningLog, setTuningLog] = useState<string[] | null>(null);
  const [pcbReviewerNote, setPcbReviewerNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await apiGet<ProjectRecord>(`/api/analog/projects/${projectId}`);
        if (!cancelled) {
          setProject(result);
          setLoadError(null);
        }
      } catch (reason) {
        if (!cancelled) {
          setProject(null);
          setLoadError({
            message: reason instanceof Error ? reason.message : 'Unable to load this project',
            status: reason instanceof ApiError ? reason.status : null,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  const selectTab = (next: number) => {
    setTab(next);
    setVisited((current) => (current.includes(next) ? current : [...current, next]));
  };

  const savePatch = async (patch: ProjectPatch): Promise<ProjectRecord> => {
    const updated = await apiPut<ProjectRecord>(`/api/analog/projects/${projectId}`, patch);
    setProject(updated);
    return updated;
  };

  const saveRequirements = async (requirements: RequirementsInput) => {
    await savePatch({ requirements });
  };

  const selectIc = async (ic: IcCatalogEntry) => {
    await savePatch({ selectedIc: ic });
  };

  const saveDesign = async (design: BuckDesign) => {
    await savePatch({ design, status: advanceStatus(project?.status ?? 'draft', 'designed') });
  };

  const saveSimulation = async (payload: {
    design: BuckDesign;
    transient: SimulationResult;
    ac: SimulationResult;
  }) => {
    await savePatch({ ...payload, status: advanceStatus(project?.status ?? 'draft', 'simulated') });
  };

  const saveChecks = async (pcbChecks: PcbCheck[]) => {
    await savePatch({ pcbChecks });
  };

  const saveReview = async (review: AiReviewResult) => {
    await savePatch({
      review,
      status:
        review.humanDecision === 'accepted'
          ? advanceStatus(project?.status ?? 'draft', 'approved')
          : advanceStatus(project?.status ?? 'draft', 'reviewed'),
    });
  };

  if (loading && !project) {
    return (
      <Container sx={{ py: 6 }}>
        <Stack direction="row" gap={2} alignItems="center">
          <CircularProgress size={24} />
          <Typography>Loading analog project…</Typography>
        </Stack>
      </Container>
    );
  }

  if (!project) {
    const status = loadError?.status ?? null;
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        {status === 401 ? (
          <Alert severity="warning">
            Sign in to open this analog project.{' '}
            <Button
              component={Link}
              href={`/login?redirect=${encodeURIComponent(`/analog/${projectId}`)}`}
              size="small"
            >
              Sign in
            </Button>
          </Alert>
        ) : status === 404 ? (
          <Alert severity="error">This analog project was not found in your workspace.</Alert>
        ) : (
          <Alert severity="error">{loadError?.message ?? 'Unable to load this project'}</Alert>
        )}
        <Button component={Link} href="/analog" variant="outlined" sx={{ mt: 2 }}>
          All designs
        </Button>
      </Container>
    );
  }

  const panels: ReactNode[] = [
    <RequirementForm
      key="requirements"
      initial={project.requirements}
      primaryLabel="Save requirements"
      primarySuccessMessage="Requirements saved to the project."
      onPrimaryAction={saveRequirements}
    />,
    <IcTable
      key="ics"
      requirements={project.requirements}
      selectedIc={project.selectedIc}
      design={project.design}
      onSelectIc={selectIc}
      onSaveDesign={saveDesign}
    />,
    <BomTable key="components" requirements={project.requirements} design={project.design} />,
    <SimulationPanel
      key="simulation"
      requirements={project.requirements}
      design={project.design}
      savedTransient={project.transient}
      savedAc={project.ac}
      onSave={saveSimulation}
      onTuningLog={setTuningLog}
    />,
    <SchematicPanel key="schematic" requirements={project.requirements} design={project.design} />,
    <PcbChecklistPanel
      key="pcb"
      design={project.design}
      initialChecks={project.pcbChecks}
      onSaveChecks={saveChecks}
      onReviewerNote={setPcbReviewerNote}
    />,
    <ReviewPanel
      key="review"
      project={project}
      onSaveReview={saveReview}
      tuningLog={tuningLog}
      pcbReviewerNote={pcbReviewerNote}
    />,
    <RunsPanel key="runs" projectId={project.id} />,
  ];

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems="flex-start">
        <Box>
          <Typography variant="overline" color="primary">
            Analog power design studio
          </Typography>
          <Typography variant="h3" fontWeight={800}>
            {project.name}
          </Typography>
          <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" sx={{ mt: 1 }}>
            <ProjectStatusChip status={project.status} />
            <Typography variant="body2" color="text.secondary">
              Updated {formatDateTime(project.updatedAt)}
            </Typography>
          </Stack>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button component={Link} href="/analog" variant="outlined">
            All designs
          </Button>
          <Button variant="outlined" disabled={loading} onClick={() => setReloadToken((value) => value + 1)}>
            Refresh
          </Button>
        </Stack>
      </Stack>

      {loadError && <Alert severity="error" sx={{ mt: 2 }}>{loadError.message}</Alert>}

      <Paper variant="outlined" sx={{ mt: 3 }}>
        <Tabs value={tab} onChange={(_, value: number) => selectTab(value)} variant="scrollable" scrollButtons="auto">
          {TAB_LABELS.map((label, index) => (
            <Tab key={label} id={`analog-tab-${index}`} aria-controls={`analog-tabpanel-${index}`} label={label} />
          ))}
        </Tabs>
      </Paper>

      {panels.map((panel, index) =>
        visited.includes(index) ? (
          <Box
            key={index}
            role="tabpanel"
            id={`analog-tabpanel-${index}`}
            aria-labelledby={`analog-tab-${index}`}
            hidden={tab !== index}
            sx={{ pt: 3 }}
          >
            {panel}
          </Box>
        ) : null,
      )}
    </Container>
  );
}
