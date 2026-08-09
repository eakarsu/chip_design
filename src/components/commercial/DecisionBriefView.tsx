'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, List, ListItem, ListItemIcon, ListItemText, Stack, TextField, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { ArrowBack, Biotech, Block, CheckCircle, FactCheck, Flag, GppGood, Science, Timeline, WarningAmber } from '@mui/icons-material';
import type { DecisionBrief } from '@/lib/commercial/types';
import { CHIP_DESIGN_LIFECYCLE, lifecyclePhaseForFeature } from '@/lib/commercial/lifecycle';

const riskColor = { low: 'success', moderate: 'warning', high: 'error', critical: 'error' } as const;
const verdictColor = { proceed: 'success', 'proceed-with-conditions': 'warning', hold: 'error', reject: 'error', 'insufficient-evidence': 'default' } as const;

function BulletList({ items, icon = 'check' }: { items: string[]; icon?: 'check' | 'warning' | 'science' | 'block' | 'flag' }) {
  const icons = {
    check: <CheckCircle color="primary" fontSize="small" />,
    warning: <WarningAmber color="warning" fontSize="small" />,
    science: <Science color="info" fontSize="small" />,
    block: <Block color="error" fontSize="small" />,
    flag: <Flag fontSize="small" />,
  };
  return items.length ? <List dense disablePadding>{items.map(item => <ListItem key={item} disableGutters alignItems="flex-start"><ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>{icons[icon]}</ListItemIcon><ListItemText primary={item} /></ListItem>)}</List> : <Typography variant="body2" color="text.secondary">None reported.</Typography>;
}

export default function DecisionBriefView({ brief, onDecision }: {
  brief: DecisionBrief;
  onDecision?: (status: 'accepted' | 'rejected', rationale: string) => Promise<void>;
}) {
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const lifecyclePhaseId = lifecyclePhaseForFeature(brief.feature);
  const lifecycleIndex = Math.max(0, CHIP_DESIGN_LIFECYCLE.findIndex(phase => phase.id === lifecyclePhaseId));
  const lifecyclePhase = CHIP_DESIGN_LIFECYCLE[lifecycleIndex];
  const previousLifecyclePhase = lifecycleIndex > 0 ? CHIP_DESIGN_LIFECYCLE[lifecycleIndex - 1] : null;
  const nextLifecyclePhases = CHIP_DESIGN_LIFECYCLE.slice(lifecycleIndex + 1, lifecycleIndex + 4);

  const decide = async (status: 'accepted' | 'rejected') => {
    if (!onDecision || rationale.trim().length < 20) return;
    setSubmitting(true); setDecisionError('');
    try { await onDecision(status, rationale.trim()); }
    catch (error) { setDecisionError(error instanceof Error ? error.message : 'Human decision could not be recorded'); }
    finally { setSubmitting(false); }
  };

  return (
    <Card variant="outlined" sx={{ mt: 3, borderWidth: 2 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Typography variant="overline" color="text.secondary">Governed engineering decision brief</Typography>
              <Chip size="small" icon={<GppGood />} label={brief.reviewMode === 'two-pass' ? 'Specialist + challenger review' : 'Specialist engineering review'} variant="outlined" />
            </Stack>
            <Typography variant="h5" fontWeight={800}>{brief.headline}</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="flex-start" flexWrap="wrap">
            <Chip label={brief.verdict.replaceAll('-', ' ').toUpperCase()} color={verdictColor[brief.verdict]} />
            <Chip label={`${brief.risk.toUpperCase()} RISK`} color={riskColor[brief.risk]} />
            <Chip label={`${brief.confidence}% review confidence`} variant="outlined" />
          </Stack>
        </Stack>

        <Alert severity={brief.verdict === 'proceed' ? 'success' : brief.verdict === 'proceed-with-conditions' ? 'warning' : 'error'} sx={{ my: 2 }}>{brief.executiveSummary}</Alert>
        <Box sx={{ p: 2, mb: 2, border: 1, borderColor: 'primary.main', borderRadius: 2, bgcolor: 'action.hover' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
            <Box><Typography variant="overline" color="primary" fontWeight={900}>PATH TO COMPLETE THE CHIP</Typography><Typography variant="h6" fontWeight={850}>This review supports phase {lifecyclePhase.order}: {lifecyclePhase.title}</Typography><Typography variant="body2" color="text.secondary">Complete this phase&apos;s measured deliverables and accountable gate before advancing. This AI brief does not complete the gate itself.</Typography></Box>
            <Stack direction="row" gap={1}><Button onClick={() => window.history.back()} startIcon={<ArrowBack />} variant="outlined">Back</Button><Button component={Link} href={`/governed-ai/lifecycle?projectId=${encodeURIComponent(brief.projectId)}#phase-${encodeURIComponent(lifecyclePhase.id)}`} startIcon={<Timeline />} variant="contained">Open exact phase</Button></Stack>
          </Stack>
          <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}><Chip color="primary" label={`${lifecyclePhase.order}. ${lifecyclePhase.title}`} />{nextLifecyclePhases.map(phase => <Chip key={phase.id} variant="outlined" label={`${phase.order}. ${phase.title}`} />)}</Stack>
          <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 1.5 }}>Required before advancing</Typography>
          {lifecyclePhase.deliverables.map(item => <Typography key={item} variant="body2">• {item}</Typography>)}
          <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 1.5 }}>Run these exact website tools</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>{lifecyclePhase.tools.map(tool => <Button key={tool.route} component={Link} href={tool.route} title={tool.purpose} variant="outlined" size="small">{tool.label}</Button>)}</Stack>
          <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>{previousLifecyclePhase && <Button component={Link} href={`/governed-ai/lifecycle?projectId=${encodeURIComponent(brief.projectId)}#phase-${encodeURIComponent(previousLifecyclePhase.id)}`} variant="text" size="small">Previous phase</Button>}{nextLifecyclePhases[0] && <Button component={Link} href={`/governed-ai/lifecycle?projectId=${encodeURIComponent(brief.projectId)}#phase-${encodeURIComponent(nextLifecyclePhases[0].id)}`} variant="text" size="small">Next phase</Button>}</Stack>
        </Box>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, md: 4 }}><Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, height: '100%' }}><Typography variant="caption" color="text.secondary">Evidence quality</Typography><Stack direction="row" gap={1} alignItems="center"><Typography variant="h4" fontWeight={850}>{brief.evidenceQuality.grade}</Typography><Typography>{brief.evidenceQuality.score}/100</Typography></Stack><Typography variant="body2" color="text.secondary">{brief.evidenceQuality.rationale}</Typography></Box></Grid>
          <Grid size={{ xs: 12, md: 8 }}><Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, height: '100%' }}><Typography variant="caption" color="text.secondary">Signoff position</Typography><Typography fontWeight={700}>{brief.signoffPosition}</Typography></Box></Grid>
          {brief.metrics.map(metric => <Grid key={metric.label} size={{ xs: 12, sm: 6, md: 3 }}><Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, height: '100%' }}><Typography variant="caption" color="text.secondary">{metric.label}</Typography><Typography fontWeight={700}>{metric.value}</Typography></Box></Grid>)}
        </Grid>

        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>Engineering findings</Typography>
        <Grid container spacing={1.5}>
          {brief.findings.map((finding, index) => <Grid key={`${finding.domain}-${index}`} size={{ xs: 12, md: 6 }}><Card variant="outlined" sx={{ height: '100%', borderLeft: 4, borderLeftColor: `${riskColor[finding.severity]}.main` }}><CardContent><Stack direction="row" justifyContent="space-between" gap={1}><Typography fontWeight={750}>{finding.domain}</Typography><Chip size="small" label={finding.severity} color={riskColor[finding.severity]} /></Stack><Typography sx={{ mt: 1 }}>{finding.finding}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}><strong>Impact:</strong> {finding.impact}</Typography><Stack direction="row" gap={0.5} mt={1} flexWrap="wrap">{finding.evidenceRefs.map(ref => <Chip key={ref} size="small" variant="outlined" label={ref} />)}</Stack></CardContent></Card></Grid>)}
        </Grid>

        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle1" fontWeight={750}>Scenario and corner coverage</Typography><Typography variant="body2" color="text.secondary">{brief.cornerCoverage.assessment}</Typography><Typography variant="caption" color="success.main">Covered</Typography><Stack direction="row" gap={0.5} flexWrap="wrap" mb={1}>{brief.cornerCoverage.covered.map(item => <Chip key={item} size="small" color="success" variant="outlined" label={item} />)}</Stack><Typography variant="caption" color="error.main">Missing or unproven</Typography><Stack direction="row" gap={0.5} flexWrap="wrap">{brief.cornerCoverage.missing.map(item => <Chip key={item} size="small" color="error" variant="outlined" label={item} />)}</Stack></Grid>
          <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle1" fontWeight={750}>Tradeoff analysis</Typography><BulletList items={brief.tradeoffs} icon="warning" /></Grid>
          {brief.sections.map(section => <Grid key={section.title} size={{ xs: 12, md: 6 }}><Typography variant="subtitle1" fontWeight={750}>{section.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{section.detail}</Typography></Grid>)}
        </Grid>

        <Divider sx={{ my: 2 }} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle1" fontWeight={750}>Recommended experiments</Typography><BulletList items={brief.recommendedExperiments} icon="science" /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle1" fontWeight={750}>Stop conditions</Typography><BulletList items={brief.stopConditions} icon="block" /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle1" fontWeight={750}>Prioritized actions</Typography><BulletList items={brief.actions} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle1" fontWeight={750}>Data gaps</Typography><BulletList items={brief.dataGaps} icon="warning" /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle1" fontWeight={750}>Human review gates</Typography><BulletList items={brief.humanReviewGates} icon="flag" /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle1" fontWeight={750}>Evidence</Typography><BulletList items={brief.evidence} icon="flag" /><Typography variant="subtitle2" fontWeight={750} sx={{ mt: 1 }}>Assumptions</Typography><BulletList items={brief.assumptions} icon="warning" /></Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Stack direction="row" gap={1} alignItems="center"><FactCheck color={brief.humanStatus === 'accepted' ? 'success' : brief.humanStatus === 'rejected' ? 'error' : 'warning'} /><Typography variant="h6" fontWeight={800}>Accountable human decision</Typography><Chip size="small" label={brief.humanStatus} /></Stack>
          {brief.humanDecision ? <Alert severity={brief.humanStatus === 'accepted' ? 'success' : 'error'} sx={{ mt: 1 }}>{brief.humanDecision.rationale}<br /><small>{brief.humanDecision.decidedBy} · {new Date(brief.humanDecision.decidedAt).toLocaleString()}</small></Alert> : onDecision && brief.id ? <Stack gap={1.5} sx={{ mt: 1.5 }}><TextField label="Decision rationale" helperText="At least 20 characters. Cite the evidence and gates you personally reviewed." multiline minRows={2} value={rationale} onChange={event => setRationale(event.target.value)} /><Stack direction="row" gap={1}><Button variant="contained" color="success" startIcon={<FactCheck />} disabled={submitting || rationale.trim().length < 20} onClick={() => void decide('accepted')}>Accept as advisory input</Button><Button variant="outlined" color="error" startIcon={<Biotech />} disabled={submitting || rationale.trim().length < 20} onClick={() => void decide('rejected')}>Reject analysis</Button></Stack>{decisionError && <Alert severity="error">{decisionError}</Alert>}</Stack> : null}
        </Box>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>Provider: {brief.provider} · Model: {brief.model} · Prompt: {brief.promptVersion}. AI review is advisory and cannot approve tape-out or replace signoff tools.</Typography>
        <Button component={Link} href={`/governed-ai/lifecycle?projectId=${encodeURIComponent(brief.projectId)}#phase-${encodeURIComponent(lifecyclePhaseId)}`} startIcon={<Timeline />} variant="outlined" sx={{ mt: 2 }}>View exact lifecycle phase</Button>
      </CardContent>
    </Card>
  );
}
