'use client';

import { Alert, Box, Card, CardContent, Chip, Divider, List, ListItem, ListItemIcon, ListItemText, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { CheckCircle, FactCheck, Flag, WarningAmber } from '@mui/icons-material';
import type { DecisionBrief } from '@/lib/commercial/types';

const riskColor = { low: 'success', moderate: 'warning', high: 'error', critical: 'error' } as const;

export default function DecisionBriefView({ brief }: { brief: DecisionBrief }) {
  return (
    <Card variant="outlined" sx={{ mt: 3, borderWidth: 2 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Typography variant="overline" color="text.secondary">Governed engineering decision brief</Typography>
            <Typography variant="h5" fontWeight={750}>{brief.headline}</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="flex-start">
            <Chip label={`${brief.risk.toUpperCase()} RISK`} color={riskColor[brief.risk]} />
            <Chip label={`${brief.confidence}% confidence`} variant="outlined" />
          </Stack>
        </Stack>
        <Alert severity="info" sx={{ my: 2 }}>{brief.executiveSummary}</Alert>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {brief.metrics.map(metric => (
            <Grid key={metric.label} size={{ xs: 12, sm: 6, md: 3 }}>
              <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, height: '100%' }}>
                <Typography variant="caption" color="text.secondary">{metric.label}</Typography>
                <Typography fontWeight={700}>{metric.value}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={2}>
          {brief.sections.map(section => (
            <Grid key={section.title} size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle1" fontWeight={700}>{section.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{section.detail}</Typography>
            </Grid>
          ))}
        </Grid>
        <Divider sx={{ my: 2 }} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" fontWeight={700}>Recommended actions</Typography>
            <List dense>{brief.actions.map(action => <ListItem key={action} disableGutters><ListItemIcon sx={{ minWidth: 32 }}><CheckCircle color="primary" fontSize="small" /></ListItemIcon><ListItemText primary={action} /></ListItem>)}</List>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" fontWeight={700}>Human review gates</Typography>
            <List dense>{brief.humanReviewGates.map(gate => <ListItem key={gate} disableGutters><ListItemIcon sx={{ minWidth: 32 }}><FactCheck color="warning" fontSize="small" /></ListItemIcon><ListItemText primary={gate} /></ListItem>)}</List>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" fontWeight={700}>Evidence</Typography>
            <List dense>{brief.evidence.map(item => <ListItem key={item} disableGutters><ListItemIcon sx={{ minWidth: 32 }}><Flag fontSize="small" /></ListItemIcon><ListItemText primary={item} /></ListItem>)}</List>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" fontWeight={700}>Assumptions</Typography>
            <List dense>{brief.assumptions.map(item => <ListItem key={item} disableGutters><ListItemIcon sx={{ minWidth: 32 }}><WarningAmber fontSize="small" /></ListItemIcon><ListItemText primary={item} /></ListItem>)}</List>
          </Grid>
        </Grid>
        <Typography variant="caption" color="text.secondary">Provider: {brief.provider} · Model: {brief.model} · Human decision: {brief.humanStatus}</Typography>
      </CardContent>
    </Card>
  );
}
