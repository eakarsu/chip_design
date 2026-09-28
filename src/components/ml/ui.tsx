'use client';

/** Small shared presentational pieces for the ML predictor workspace. */
import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';

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

/**
 * The workspace's own insufficient-data state, shown verbatim with the
 * analytical-fallback guidance the predictor is meant to trigger.
 */
export function InsufficientDataAlert({
  sampleCount,
  minTrainingSamples,
}: {
  sampleCount: number;
  minTrainingSamples?: number;
}) {
  return (
    <Alert severity="warning">
      <Stack gap={0.5}>
        <Typography variant="body2" fontWeight={700}>
          insufficientData: this model was trained on {sampleCount.toLocaleString()} sample(s)
          {minTrainingSamples !== undefined ? `, below the workspace minimum of ${minTrainingSamples}` : ''}.
        </Typography>
        <Typography variant="body2">
          Do not treat the prediction as evidence. Until enough OpenLane runs exist, prefer a
          first-principles analytical estimate (for example the HLS estimator) over this surrogate,
          and re-train after more runs are stored.
        </Typography>
      </Stack>
    </Alert>
  );
}
