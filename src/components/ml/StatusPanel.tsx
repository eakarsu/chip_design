'use client';

/**
 * Status tab: GET /api/ml/status rendered as returned — sample counts per
 * target across stored OpenLane runs, which targets are available, persisted
 * training samples, and the stored models with their training metrics.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { MlStatusResponse } from './types';
import { EmptyNotice } from './ui';
import { formatDateTime, formatNumber } from './utils';

export interface StatusPanelProps {
  status: MlStatusResponse | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

export default function StatusPanel({ status, loading, error, onRefresh }: StatusPanelProps) {
  return (
    <Stack gap={2}>
      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="outlined" startIcon={<RefreshIcon />} disabled={loading} onClick={onRefresh}>
          Refresh status
        </Button>
        {loading && <CircularProgress size={20} />}
        {status && <Chip size="small" variant="outlined" label={`generated ${formatDateTime(status.generatedAt)}`} />}
        {status && (
          <Chip size="small" variant="outlined" label={`minimum training samples: ${status.minTrainingSamples}`} />
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {!status && !loading && !error && <EmptyNotice>No status response yet.</EmptyNotice>}

      {status && (
        <Stack gap={3}>
          <Box>
            <Typography variant="h6">Stored samples</Typography>
            <Typography variant="body2" color="text.secondary">
              Persisted rows in <code>ml_samples</code>, grouped by target. Total:{' '}
              {status.samples.total.toLocaleString()}.
            </Typography>
            {Object.keys(status.samples.byTarget).length === 0 ? (
              <EmptyNotice>No training samples have been persisted yet.</EmptyNotice>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Target</TableCell>
                      <TableCell align="right">Samples</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(status.samples.byTarget).map(([target, count]) => (
                      <TableRow key={target}>
                        <TableCell>{target}</TableCell>
                        <TableCell align="right">{count.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>

          <Box>
            <Typography variant="h6">Available targets</Typography>
            <Typography variant="body2" color="text.secondary">
              Targets are driven by the stored OpenLane run metrics. A target is available when at
              least one stored run exposes one of its metric keys.
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Target</TableCell>
                    <TableCell>Label</TableCell>
                    <TableCell>Metric keys (first finite wins)</TableCell>
                    <TableCell align="right">Runs with metric</TableCell>
                    <TableCell>Availability</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {status.targets.map((target) => (
                    <TableRow key={target.target}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                          {target.target}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {target.description}
                        </Typography>
                      </TableCell>
                      <TableCell>{target.label}</TableCell>
                      <TableCell>
                        <Stack gap={0.25}>
                          {target.metricKeys.map((key) => (
                            <Typography key={key} variant="caption" sx={{ fontFamily: 'monospace' }}>
                              {key}
                            </Typography>
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{target.sampleCount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={target.available ? 'success' : 'default'}
                          variant={target.available ? 'filled' : 'outlined'}
                          label={target.available ? 'available' : 'no samples'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <Box>
            <Typography variant="h6">Stored models</Typography>
            {status.models.length === 0 ? (
              <EmptyNotice>
                No models have been trained yet. Use the Train tab after OpenLane runs with the
                target metric exist.
              </EmptyNotice>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Target</TableCell>
                      <TableCell align="right">Samples</TableCell>
                      <TableCell align="right">R²</TableCell>
                      <TableCell align="right">RMSE</TableCell>
                      <TableCell align="right">Residual σ</TableCell>
                      <TableCell>Data flag</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell>Created by</TableCell>
                      <TableCell>Created</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {status.models.map((model) => (
                      <TableRow key={model.id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}>
                            {model.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            {model.id}
                          </Typography>
                        </TableCell>
                        <TableCell>{model.target}</TableCell>
                        <TableCell align="right">{model.sampleCount.toLocaleString()}</TableCell>
                        <TableCell align="right">{formatNumber(model.r2, 6)}</TableCell>
                        <TableCell align="right">{formatNumber(model.rmse, 6)}</TableCell>
                        <TableCell align="right">{formatNumber(model.residualStd, 6)}</TableCell>
                        <TableCell>
                          {model.insufficientData ? (
                            <Chip size="small" color="warning" label="insufficientData" />
                          ) : (
                            <Chip size="small" color="success" variant="outlined" label="enough data" />
                          )}
                        </TableCell>
                        <TableCell>{model.source}</TableCell>
                        <TableCell>{model.createdBy ?? '—'}</TableCell>
                        <TableCell>{formatDateTime(model.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
