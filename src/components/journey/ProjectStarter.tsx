'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { journeyTemplates } from '@/lib/journey/catalog';
import type { DesignRevision, TemplateId } from '@/lib/journey/types';
import { journeyApi } from './api';

export default function ProjectStarter({
  projectId,
  initialTemplate = 'gcd',
}: {
  projectId?: string;
  initialTemplate?: TemplateId;
}) {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateId>(initialTemplate);
  const [name, setName] = useState('My first chip');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    journeyApi<{ projects: typeof projects }>('/api/journey/projects')
      .then((result) => setProjects(result.projects))
      .catch((error) => setError(error.message));
  }, []);
  async function start() {
    setBusy(true);
    setError('');
    try {
      const { revision } = await journeyApi<{ revision: DesignRevision }>('/api/journey/projects', {
        name,
        templateId: template,
        ...(projectId ? { projectId } : {}),
      });
      if (projectId) window.location.reload();
      else router.push(`/workspace/projects/${revision.projectId}?view=learn`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to create project');
    }
    setBusy(false);
  }
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Typography variant="overline" color="primary">
        LEARN · BUILD · VERIFY · BRING UP
      </Typography>
      <Typography component="h1" variant="h3" fontWeight={850} sx={{ my: 1 }}>
        One design, from idea to hardware
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 760 }}>
        Keep your specification, RTL, constraints, testbenches and evidence together. Switch between guided learning and
        engineering controls at any stage.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error} <Link href="/login">Sign in</Link> to use your private projects.
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' }, gap: 2 }}>
        {journeyTemplates.map((item) => (
          <Card
            variant="outlined"
            key={item.id}
            sx={{
              borderColor: template === item.id ? 'primary.main' : 'divider',
              borderWidth: template === item.id ? 2 : 1,
            }}
          >
            <CardContent>
              <Chip size="small" label={item.level} />
              <Typography variant="h6" fontWeight={750} sx={{ mt: 2 }}>
                {item.title}
              </Typography>
              <Typography color="text.secondary" sx={{ my: 2 }}>
                {item.description}
              </Typography>
              <Button
                variant={template === item.id ? 'contained' : 'outlined'}
                onClick={() => setTemplate(item.id)}
                aria-pressed={template === item.id}
              >
                Choose {item.id.toUpperCase()}
              </Button>
            </CardContent>
          </Card>
        ))}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ my: 3 }}>
        <TextField
          label="Project name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          fullWidth
          inputProps={{ maxLength: 120 }}
        />
        <Button
          variant="contained"
          disabled={busy || name.trim().length < 2}
          onClick={() => void start()}
          sx={{ minWidth: 180 }}
        >
          {busy ? 'Creating…' : projectId ? 'Initialize project' : 'Create project'}
        </Button>
      </Stack>
      {!projectId && projects.length > 0 && (
        <TextField
          select
          label="Continue an existing project"
          value=""
          fullWidth
          onChange={(event) => router.push(`/workspace/projects/${event.target.value}`)}
        >
          {projects.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
        <Button component={Link} href="/academy">
          Academy
        </Button>
        <Button component={Link} href="/workspace">
          Commercial workspace
        </Button>
        <Button component={Link} href="/governed-ai/lifecycle">
          Design lifecycle
        </Button>
      </Stack>
    </Container>
  );
}
