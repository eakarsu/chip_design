'use client';

/**
 * ML predictor workspace: what the surrogate pipeline knows (status), governed
 * training on stored OpenLane runs, and per-configuration prediction with the
 * ±1σ uncertainty proxy and the explicit insufficient-data state.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  Container,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import InsightsIcon from '@mui/icons-material/Insights';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import OnlinePredictionIcon from '@mui/icons-material/OnlinePrediction';
import type { MlStatusResponse } from '@/components/ml/types';
import { apiGet } from '@/components/ml/api';
import StatusPanel from '@/components/ml/StatusPanel';
import TrainPanel from '@/components/ml/TrainPanel';
import PredictPanel from '@/components/ml/PredictPanel';

type TabKey = 'status' | 'train' | 'predict';

export default function MlPage() {
  const [tab, setTab] = useState<TabKey>('status');
  const [status, setStatus] = useState<MlStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const result = await apiGet<MlStatusResponse>('/api/ml/status');
        if (!cancelled) setStatus(result);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'ML status unavailable');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack gap={1}>
        <Typography variant="overline" color="primary">
          Deterministic ridge surrogate
        </Typography>
        <Typography variant="h3" fontWeight={800}>
          ML Predictor Workspace
        </Typography>
        <Typography color="text.secondary" maxWidth={960}>
          A real supervised learner trained on stored OpenLane run metrics: full-batch gradient
          descent with a seeded shuffle, no <code>Math.random</code>, no external ML library.
          Predictions carry the training residual σ as a ±1σ proxy and an explicit
          insufficient-data flag; models are never fabricated when runs are missing.
        </Typography>
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
          <Chip size="small" variant="outlined" label="train → predict" />
          <Chip size="small" variant="outlined" color="warning" label="training metrics are in-sample" />
          <Chip size="small" variant="outlined" label="governed training (admin/editor)" />
        </Stack>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, value: TabKey) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="ML workspace sections"
        >
          <Tab value="status" label="Status" icon={<InsightsIcon fontSize="small" />} iconPosition="start" />
          <Tab value="train" label="Train" icon={<ModelTrainingIcon fontSize="small" />} iconPosition="start" />
          <Tab value="predict" label="Predict" icon={<OnlinePredictionIcon fontSize="small" />} iconPosition="start" />
        </Tabs>
      </Box>

      <Box sx={{ pt: 3, display: tab === 'status' ? 'block' : 'none' }}>
        <StatusPanel
          status={status}
          loading={loading}
          error={error}
          onRefresh={() => setReloadToken((value) => value + 1)}
        />
      </Box>

      <Box sx={{ pt: 3, display: tab === 'train' ? 'block' : 'none' }}>
        <TrainPanel targets={status?.targets ?? null} onTrained={() => setReloadToken((value) => value + 1)} />
      </Box>

      <Box sx={{ pt: 3, display: tab === 'predict' ? 'block' : 'none' }}>
        <PredictPanel
          models={status?.models ?? null}
          targets={status?.targets ?? null}
          minTrainingSamples={status?.minTrainingSamples}
        />
      </Box>
    </Container>
  );
}
