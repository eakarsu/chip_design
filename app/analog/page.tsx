'use client';

/**
 * Analog Power Design Studio landing page: workflow summary, simulator
 * availability and the saved project list.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Stack,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { Add } from '@mui/icons-material';
import { apiGet, isUnauthorized } from '@/components/analog/api';
import type { AnalogCatalog, ProjectRecord } from '@/components/analog/types';
import { ProjectStatusChip } from '@/components/analog/ui';
import { formatDateTime, formatWithUnit } from '@/components/analog/utils';

const WORKFLOW = [
  'requirements',
  'IC selection',
  'component sizing',
  'simulation',
  'schematic',
  'PCB review',
  'AI challenge',
  'human decision',
];

export default function AnalogLandingPage() {
  const [catalog, setCatalog] = useState<AnalogCatalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [projectsError, setProjectsError] = useState('');
  const [projectsUnauthorized, setProjectsUnauthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [catalogResult, projectsResult] = await Promise.allSettled([
        apiGet<AnalogCatalog>('/api/analog/catalog'),
        apiGet<ProjectRecord[]>('/api/analog/projects'),
      ]);
      if (cancelled) return;
      if (catalogResult.status === 'fulfilled') setCatalog(catalogResult.value);
      else setCatalogError(catalogResult.reason instanceof Error ? catalogResult.reason.message : 'Catalog unavailable');
      if (projectsResult.status === 'fulfilled') setProjects(projectsResult.value);
      else if (isUnauthorized(projectsResult.reason)) setProjectsUnauthorized(true);
      else {
        setProjectsError(
          projectsResult.reason instanceof Error ? projectsResult.reason.message : 'Project list unavailable',
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems="flex-start">
        <Box>
          <Typography variant="overline" color="primary">
            Analog power design
          </Typography>
          <Typography variant="h3" fontWeight={800}>
            Analog Power Design Studio
          </Typography>
          <Typography color="text.secondary" maxWidth={900}>
            A governed buck-converter workflow that mirrors an analog design review: requirements → IC selection →
            component sizing → simulation → schematic → PCB review → AI challenge → human decision. Calculations and
            simulations are labelled with their assumptions; nothing is fabricated when data is missing.
          </Typography>
          <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" sx={{ mt: 2 }}>
            {WORKFLOW.map((step) => (
              <Chip key={step} size="small" variant="outlined" label={step} />
            ))}
          </Stack>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <Button component={Link} href="/analog/new" variant="contained" startIcon={<Add />}>
            New design
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" sx={{ mt: 3 }}>
        {catalog?.simulator.available ? (
          <Chip
            color="success"
            label={`ngspice ready · ${catalog.simulator.version ?? catalog.simulator.binary}`}
          />
        ) : catalog ? (
          <Chip color="warning" label={`ngspice unavailable · ${catalog.simulator.binary}`} />
        ) : (
          <Chip label="Simulator availability unknown" />
        )}
        {catalog && !catalog.simulator.available && catalog.simulator.reason && (
          <Typography variant="body2" color="text.secondary">
            {catalog.simulator.reason}
          </Typography>
        )}
      </Stack>
      {catalogError && <Alert severity="error" sx={{ mt: 2 }}>{catalogError}</Alert>}
      {catalog && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          {catalog.note}
        </Typography>
      )}

      <Typography variant="h5" fontWeight={750} sx={{ mt: 4 }}>
        Saved designs
      </Typography>

      {loading && (
        <Stack direction="row" gap={2} alignItems="center" sx={{ mt: 2 }}>
          <CircularProgress size={22} />
          <Typography color="text.secondary">Loading projects…</Typography>
        </Stack>
      )}

      {projectsUnauthorized && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Sign in to view and manage your saved analog projects.{' '}
          <Button component={Link} href={`/login?redirect=${encodeURIComponent('/analog')}`} size="small">
            Sign in
          </Button>
        </Alert>
      )}
      {projectsError && <Alert severity="error" sx={{ mt: 2 }}>{projectsError}</Alert>}

      {projects && projects.length === 0 && !loading && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No analog designs yet. Start with <Link href="/analog/new">New design</Link>.
        </Alert>
      )}

      {projects && projects.length > 0 && (
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {projects.map((project) => (
            <Grid key={project.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardActionArea component={Link} href={`/analog/${project.id}`} sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack direction="row" gap={1} alignItems="center" justifyContent="space-between">
                      <Typography variant="h6" fontWeight={700}>
                        {project.name}
                      </Typography>
                      <ProjectStatusChip status={project.status} />
                    </Stack>
                    {project.requirements && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {formatWithUnit(project.requirements.vinMin, 'V', 1)}–
                        {formatWithUnit(project.requirements.vinMax, 'V', 1)} V in ·{' '}
                        {formatWithUnit(project.requirements.vout, 'V', 2)} V out ·{' '}
                        {formatWithUnit(project.requirements.ioutMax, 'A', 2)} out
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
                      Updated {formatDateTime(project.updatedAt)}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
}
