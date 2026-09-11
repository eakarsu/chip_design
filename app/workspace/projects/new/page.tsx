'use client';

import { useMemo, useState } from 'react';
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
  List,
  ListItem,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { journeyApi } from '@/components/journey/api';
import { CHIP_DESIGN_LIFECYCLE } from '@/lib/commercial/lifecycle';
import { journeyTemplate, journeyTemplates } from '@/lib/journey/catalog';
import { deriveRequirementsFromSpec, recommendTemplate } from '@/lib/journey/specification';
import type { DesignRevision, TemplateId } from '@/lib/journey/types';

type WizardMode = 'template' | 'spec';

const paperStyle = { p: { xs: 2, md: 3 }, borderRadius: 2 };
const comparisonSymbol = (comparison: 'lte' | 'gte' | 'eq') =>
  comparison === 'lte' ? '≤' : comparison === 'gte' ? '≥' : '=';

export default function ProjectSpecificationWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<WizardMode>('template');
  const [template, setTemplate] = useState<TemplateId>('gcd');
  const [specification, setSpecification] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = journeyTemplate(template);
  const derived = useMemo(
    () => (mode === 'spec' ? deriveRequirementsFromSpec(specification) : []),
    [mode, specification]
  );
  const suggested = useMemo(
    () => (mode === 'spec' ? journeyTemplate(recommendTemplate(specification)) : null),
    [mode, specification]
  );
  const canContinue = name.trim().length >= 2 && (mode === 'template' || specification.trim().length >= 20);
  const authIssue = /unauthor|forbidden|sign in|signin|membership|session|login/i.test(error);

  function review() {
    if (mode === 'spec') setTemplate(recommendTemplate(specification));
    setError('');
    setStep(1);
  }

  async function create() {
    setBusy(true);
    setError('');
    try {
      const { revision } = await journeyApi<{ revision: DesignRevision }>('/api/journey/projects', {
        name: name.trim(),
        templateId: template,
      });
      router.push(`/workspace/projects/${revision.projectId}?view=learn`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to create project');
      setBusy(false);
    }
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 6 } }}>
      <Button component={Link} href="/workspace/projects" size="small">
        ← All design projects
      </Button>
      <Typography variant="overline" color="primary" sx={{ display: 'block', mt: 1 }}>
        START FROM SPECIFICATION
      </Typography>
      <Typography component="h1" variant="h3" fontWeight={850} sx={{ my: 1 }}>
        Create a Journey project
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 820 }}>
        Name the project, choose a published reference template or paste your own specification, then review the
        requirements before the project starts in the 14-phase flow.
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(320px, 1fr)' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Paper variant="outlined" sx={paperStyle}>
          <Stepper activeStep={step} sx={{ mb: 3, maxWidth: 560 }}>
            <Step>
              <StepLabel>Define the design</StepLabel>
            </Step>
            <Step>
              <StepLabel>Review requirements</StepLabel>
            </Step>
          </Stepper>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
              {authIssue && (
                <>
                  {' '}
                  <Link href="/login">Sign in</Link> to use your private projects.
                </>
              )}
            </Alert>
          )}
          {step === 0 && (
            <Stack gap={3}>
              <TextField
                label="Project name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                fullWidth
                required
                inputProps={{ maxLength: 120 }}
                helperText="2–120 characters"
              />
              <ToggleButtonGroup
                exclusive
                value={mode}
                onChange={(_, value: WizardMode | null) => {
                  if (value) {
                    setMode(value);
                    setError('');
                  }
                }}
                aria-label="How to define the design"
              >
                <ToggleButton value="template">Choose a reference template</ToggleButton>
                <ToggleButton value="spec">Paste a specification</ToggleButton>
              </ToggleButtonGroup>
              {mode === 'template' ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                  {journeyTemplates.map((item) => (
                    <Card
                      key={item.id}
                      variant="outlined"
                      sx={{
                        borderColor: template === item.id ? 'primary.main' : 'divider',
                        borderWidth: template === item.id ? 2 : 1,
                      }}
                    >
                      <CardContent>
                        <Chip size="small" label={item.level} />
                        <Typography variant="h6" fontWeight={750} sx={{ mt: 1.5 }}>
                          {item.title}
                        </Typography>
                        <Typography color="text.secondary" variant="body2" sx={{ my: 1.5 }}>
                          {item.description}
                        </Typography>
                        <Button
                          variant={template === item.id ? 'contained' : 'outlined'}
                          onClick={() => setTemplate(item.id)}
                          aria-pressed={template === item.id}
                        >
                          Use {item.id.toUpperCase()}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              ) : (
                <>
                  <TextField
                    label="Paste the specification"
                    value={specification}
                    onChange={(event) => setSpecification(event.target.value)}
                    fullWidth
                    multiline
                    minRows={10}
                    inputProps={{ maxLength: 20000 }}
                    helperText="At least 20 characters. Requirement-like statements are extracted for review; the project stores the published reference contract."
                  />
                  {suggested && specification.trim().length >= 20 && (
                    <Alert severity="info">
                      Closest published reference template: <strong>{suggested.title}</strong>. You can change it in the
                      review step.
                    </Alert>
                  )}
                </>
              )}
            </Stack>
          )}
          {step === 1 && (
            <Stack gap={2}>
              <Typography variant="h6">Generated requirements summary</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
                <TextField
                  label="Project name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  inputProps={{ maxLength: 120 }}
                />
                <TextField
                  select
                  label="Reference implementation"
                  value={template}
                  onChange={(event) => setTemplate(event.target.value as TemplateId)}
                  helperText={`Top module ${selected.topModule}`}
                >
                  {journeyTemplates.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.title}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              {mode === 'template' ? (
                <>
                  <Typography variant="body2" color="text.secondary">
                    {selected.description}
                  </Typography>
                  {selected.requirements.map((item) => (
                    <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                        <Chip size="small" label={item.id} />
                        <Typography variant="body2">{item.description}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {item.metric} {comparisonSymbol(item.comparison)} {item.target} {item.unit}
                      </Typography>
                    </Paper>
                  ))}
                </>
              ) : (
                <>
                  <Alert severity="info">
                    Derived from your pasted text for review. The created project retains the published {selected.title}{' '}
                    specification, sources and fixed grading contracts; paste the full specification into the project
                    editor after creation.
                  </Alert>
                  {derived.length === 0 ? (
                    <Alert severity="warning">
                      No requirement-like statements were detected. You can still create the project and edit the
                      specification in the project editor.
                    </Alert>
                  ) : (
                    derived.map((item) => (
                      <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
                        <Stack direction="row" gap={1} alignItems="center">
                          <Chip size="small" label={item.id} />
                          <Typography variant="body2">{item.description}</Typography>
                        </Stack>
                      </Paper>
                    ))
                  )}
                  <Typography variant="subtitle2">Published reference contract (used for grading)</Typography>
                  {selected.requirements.map((item) => (
                    <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                        <Chip size="small" label={item.id} />
                        <Typography variant="body2">{item.description}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {item.metric} {comparisonSymbol(item.comparison)} {item.target} {item.unit}
                      </Typography>
                    </Paper>
                  ))}
                </>
              )}
            </Stack>
          )}
          <Stack direction="row" gap={1} justifyContent="flex-end" sx={{ mt: 3 }}>
            {step === 1 && (
              <Button onClick={() => setStep(0)} disabled={busy}>
                Back
              </Button>
            )}
            {step === 0 ? (
              <Button variant="contained" disabled={!canContinue} onClick={review}>
                Review requirements
              </Button>
            ) : (
              <Button variant="contained" disabled={busy || name.trim().length < 2} onClick={() => void create()}>
                {busy ? 'Creating…' : 'Create project'}
              </Button>
            )}
          </Stack>
        </Paper>
        <Paper
          variant="outlined"
          sx={{
            ...paperStyle,
            alignSelf: 'start',
            position: { lg: 'sticky' },
            top: 24,
            maxHeight: { lg: 'calc(100vh - 48px)' },
            overflow: { lg: 'auto' },
          }}
        >
          <Typography variant="h6">14-phase design flow</Typography>
          <Alert severity="info" sx={{ my: 2 }}>
            Every phase requires retained evidence and an explicit human approval before the project can advance. AI
            review is advisory only.
          </Alert>
          <List dense disablePadding>
            {CHIP_DESIGN_LIFECYCLE.map((phase) => (
              <ListItem key={phase.id} disableGutters sx={{ display: 'block', py: 1 }}>
                <Link href={phase.route} style={{ fontWeight: 700 }}>
                  {phase.order}. {phase.title}
                </Link>
                <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 0.5 }}>
                  Gate: {phase.gate}
                </Typography>
                <Stack direction="row" flexWrap="wrap" columnGap={1}>
                  {phase.tools.map((tool) => (
                    <Link key={`${phase.id}-${tool.route}`} href={tool.route} style={{ fontSize: 12 }}>
                      {tool.label}
                    </Link>
                  ))}
                </Stack>
              </ListItem>
            ))}
          </List>
        </Paper>
      </Box>
    </Container>
  );
}
