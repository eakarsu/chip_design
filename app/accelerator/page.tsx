'use client';

/**
 * Accelerator workspace: a systolic-array GEMM RTL generator with self-checking
 * testbenches, and a polyhedral loop-nest explorer with a documented
 * memory-traffic model and Pareto front.
 *
 * Generated RTL requires verification; schedules are model-based estimates.
 */
import { useState } from 'react';
import {
  Box,
  Chip,
  Container,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import GridOnIcon from '@mui/icons-material/GridOn';
import SystolicPanel from '@/components/accelerator/SystolicPanel';
import PolyhedralPanel from '@/components/accelerator/PolyhedralPanel';

type TabKey = 'systolic' | 'polyhedral';

export default function AcceleratorPage() {
  const [tab, setTab] = useState<TabKey>('systolic');

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack gap={1}>
        <Typography variant="overline" color="primary">
          Hardware accelerator generators
        </Typography>
        <Typography variant="h3" fontWeight={800}>
          Accelerator Workspace
        </Typography>
        <Typography color="text.secondary" maxWidth={960}>
          Generate a systolic GEMM with a self-checking testbench and closed-form cycle/utilization
          model, or explore affine loop nests for legal tilings and loop orders under a two-level
          memory model. Generated RTL is not verified by generation alone, and schedules are
          estimates to validate on the target memory system.
        </Typography>
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
          <Chip size="small" variant="outlined" color="warning" label="generated RTL requires verification" />
          <Chip size="small" variant="outlined" label="model-based cycle/utilization numbers" />
          <Chip size="small" variant="outlined" label="dependence-exact bounded enumeration" />
        </Stack>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, value: TabKey) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Accelerator workspace sections"
        >
          <Tab value="systolic" label="Systolic GEMM" icon={<DeveloperBoardIcon fontSize="small" />} iconPosition="start" />
          <Tab value="polyhedral" label="Polyhedral explorer" icon={<GridOnIcon fontSize="small" />} iconPosition="start" />
        </Tabs>
      </Box>

      <Box sx={{ pt: 3, display: tab === 'systolic' ? 'block' : 'none' }}>
        <SystolicPanel />
      </Box>

      <Box sx={{ pt: 3, display: tab === 'polyhedral' ? 'block' : 'none' }}>
        <PolyhedralPanel />
      </Box>
    </Container>
  );
}
