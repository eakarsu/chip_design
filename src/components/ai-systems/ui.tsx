'use client';

/** Small shared presentational pieces for the AI-systems analytical models. */
import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import type { EstimateMeta } from './types';

/**
 * The required framing for every model result: the `analytical-estimate` label,
 * the disclaimer, and the model's own assumptions and limitations, all rendered
 * as returned by the API.
 */
export function EstimateFrame({ meta, children }: { meta: EstimateMeta; children?: ReactNode }) {
  return (
    <Stack gap={2}>
      <Alert severity="info" icon={false}>
        <Stack gap={0.5}>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Chip size="small" color="info" label={meta.label} />
            <Typography variant="caption" color="text.secondary">
              analytical estimate — not a measurement, not a benchmark
            </Typography>
          </Stack>
          <Typography variant="body2">{meta.disclaimer}</Typography>
        </Stack>
      </Alert>

      {children}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Assumptions (as returned)
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {meta.assumptions.map((assumption, index) => (
                <li key={`${index}-${assumption.slice(0, 24)}`}>
                  <Typography variant="body2">{assumption}</Typography>
                </li>
              ))}
            </Box>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Limitations (as returned)
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {meta.limitations.map((limitation, index) => (
                <li key={`${index}-${limitation.slice(0, 24)}`}>
                  <Typography variant="body2">{limitation}</Typography>
                </li>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

export function KeyValueGrid({
  rows,
  size = { xs: 12, sm: 6, md: 3 },
  title,
}: {
  rows: Array<[string, ReactNode]>;
  size?: { xs?: number; sm?: number; md?: number; lg?: number };
  title?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Box>
      {title && (
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
      )}
      <Grid container spacing={1.5} sx={{ mt: title ? 0.5 : 0 }}>
        {rows.map(([label, value]) => (
          <Grid key={label} size={size}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Typography variant="caption" color="text.secondary" component="div">
                  {label}
                </Typography>
                <Typography variant="subtitle1" fontWeight={700} component="div">
                  {value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export function EmptyNotice({ children }: { children: ReactNode }) {
  return <Alert severity="info">{children}</Alert>;
}

export function ChipList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Stack direction="row" gap={0.5} flexWrap="wrap">
        {items.map((item) => (
          <Chip key={item} size="small" variant="outlined" label={item} />
        ))}
      </Stack>
    </Box>
  );
}
