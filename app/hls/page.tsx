'use client';

/**
 * HLS workspace: restricted-C kernel analysis, analytical design-space
 * exploration, per-point estimation, scaffold generation, and a governed
 * refactoring draft.
 *
 * Every section states which part of the flow actually ran. Parse results,
 * analytical estimates, generated scaffolds, and LLM drafts are labelled as
 * such and never presented as synthesis or verification evidence.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Container,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import MemoryIcon from '@mui/icons-material/Memory';
import TuneIcon from '@mui/icons-material/Tune';
import InsightsIcon from '@mui/icons-material/Insights';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import type { AnalyzeResponse, LoopPragmaEditing, ParameterRow, RankedDesignPoint } from '@/components/hls/types';
import { apiPost } from '@/components/hls/api';
import { buildParameterRecord } from '@/components/hls/ParameterEditor';
import { defaultLoopPragmas, loopPragmasFromRanked } from '@/components/hls/DesignPointEditor';
import KernelPanel from '@/components/hls/KernelPanel';
import DesignSpacePanel from '@/components/hls/DesignSpacePanel';
import EstimatePanel from '@/components/hls/EstimatePanel';
import RtlPanel from '@/components/hls/RtlPanel';
import RefactorPanel from '@/components/hls/RefactorPanel';

type TabKey = 'kernel' | 'space' | 'estimate' | 'rtl' | 'refactor';

/** Example kernel so the workspace starts with a real, analyzable input. */
const EXAMPLE_KERNEL = `#define N 4
void matmul(int A[N][N], int B[N][N], int C[N][N]) {
  for (int i = 0; i < N; i++) {
    for (int j = 0; j < N; j++) {
      for (int k = 0; k < N; k++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }
}
`;

export default function HlsPage() {
  const [tab, setTab] = useState<TabKey>('kernel');
  const [kernel, setKernel] = useState(EXAMPLE_KERNEL);
  const [parameters, setParameters] = useState<ParameterRow[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [pragmas, setPragmas] = useState<LoopPragmaEditing[]>([]);
  const [pickedLabel, setPickedLabel] = useState('');

  const parameterBuild = useMemo(() => buildParameterRecord(parameters), [parameters]);
  const parameterRecord = parameterBuild.error ? undefined : parameterBuild.record;

  useEffect(() => {
    setPragmas(defaultLoopPragmas(analysis?.loops ?? []));
    setPickedLabel('');
  }, [analysis]);

  const runAnalyze = async (record: Record<string, number> | undefined) => {
    setAnalyzing(true);
    setAnalysisError('');
    try {
      const response = await apiPost<AnalyzeResponse>('/api/hls/analyze', {
        kernel,
        ...(record ? { parameters: record } : {}),
      });
      setAnalysis(response);
    } catch (reason) {
      setAnalysis(null);
      setAnalysisError(reason instanceof Error ? reason.message : 'Kernel analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const pickPoint = (point: RankedDesignPoint) => {
    setPragmas(loopPragmasFromRanked(point.loopPragmas));
    setPickedLabel(`rank ${point.rank} · ${point.pragmaKey}`);
    setTab('estimate');
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack gap={1}>
        <Typography variant="overline" color="primary">
          Evidence-labelled HLS tooling
        </Typography>
        <Typography variant="h3" fontWeight={800}>
          HLS Workspace
        </Typography>
        <Typography color="text.secondary" maxWidth={960}>
          A restricted-C kernel parser and IR, bounded pragma design-space enumeration with
          analytical Pareto ranking, a per-point cost model, Verilog scaffold generation, and a
          deterministic synthesizability scan with an LLM refactoring draft. No commercial HLS tool
          runs here, and tool runs are reported with their own labels.
        </Typography>
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
          <Chip size="small" variant="outlined" label="parse → estimate → scaffold" />
          <Chip size="small" variant="outlined" color="warning" label="analytical estimates, not synthesis evidence" />
          <Chip size="small" variant="outlined" label="no tool-in-the-loop search" />
        </Stack>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, value: TabKey) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="HLS workspace sections"
        >
          <Tab value="kernel" label="Kernel" icon={<MemoryIcon fontSize="small" />} iconPosition="start" />
          <Tab value="space" label="Design space" icon={<TuneIcon fontSize="small" />} iconPosition="start" />
          <Tab value="estimate" label="Estimate" icon={<InsightsIcon fontSize="small" />} iconPosition="start" />
          <Tab value="rtl" label="RTL" icon={<DeveloperBoardIcon fontSize="small" />} iconPosition="start" />
          <Tab value="refactor" label="Refactor" icon={<AutoFixHighIcon fontSize="small" />} iconPosition="start" />
        </Tabs>
      </Box>

      <Box sx={{ pt: 3, display: tab === 'kernel' ? 'block' : 'none' }}>
        <KernelPanel
          kernel={kernel}
          onKernelChange={setKernel}
          parameters={parameters}
          onParametersChange={setParameters}
          analysis={analysis}
          analyzing={analyzing}
          error={analysisError}
          parameterError={parameterBuild.error}
          onAnalyze={(record) => void runAnalyze(record)}
        />
      </Box>

      <Box sx={{ pt: 3, display: tab === 'space' ? 'block' : 'none' }}>
        <DesignSpacePanel
          kernel={kernel}
          parameters={parameterRecord}
          parameterError={parameterBuild.error}
          onPickPoint={pickPoint}
        />
      </Box>

      <Box sx={{ pt: 3, display: tab === 'estimate' ? 'block' : 'none' }}>
        <EstimatePanel
          kernel={kernel}
          parameters={parameterRecord}
          parameterError={parameterBuild.error}
          loops={analysis?.loops ?? null}
          pragmas={pragmas}
          onPragmasChange={setPragmas}
          pickedLabel={pickedLabel}
        />
      </Box>

      <Box sx={{ pt: 3, display: tab === 'rtl' ? 'block' : 'none' }}>
        <RtlPanel
          kernel={kernel}
          parameters={parameterRecord}
          parameterError={parameterBuild.error}
          loops={analysis?.loops ?? null}
          pragmas={pragmas}
          onPragmasChange={setPragmas}
        />
      </Box>

      <Box sx={{ pt: 3, display: tab === 'refactor' ? 'block' : 'none' }}>
        <RefactorPanel />
      </Box>
    </Container>
  );
}
