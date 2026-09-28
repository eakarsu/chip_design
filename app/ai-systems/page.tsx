'use client';

/**
 * AI-systems workspace: five analytical models (hierarchical memory, quantization,
 * LUT inference, GPU+FPGA hybrid planning, embedded-DRAM projection).
 *
 * Every response is labelled `analytical-estimate` and rendered together with
 * its assumptions and limitations. None of these models is a measurement or an
 * implementation of a published system.
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
import LayersIcon from '@mui/icons-material/Layers';
import CompressIcon from '@mui/icons-material/Compress';
import TableChartIcon from '@mui/icons-material/TableChart';
import HubIcon from '@mui/icons-material/Hub';
import StorageIcon from '@mui/icons-material/Storage';
import HmtPanel from '@/components/ai-systems/HmtPanel';
import QuantizationPanel from '@/components/ai-systems/QuantizationPanel';
import LutPanel from '@/components/ai-systems/LutPanel';
import HybridPanel from '@/components/ai-systems/HybridPanel';
import MemoryTechPanel from '@/components/ai-systems/MemoryTechPanel';

type TabKey = 'hmt' | 'quantization' | 'lut' | 'hybrid' | 'memory-tech';

export default function AiSystemsPage() {
  const [tab, setTab] = useState<TabKey>('hmt');

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack gap={1}>
        <Typography variant="overline" color="primary">
          Efficient-AI analytical models
        </Typography>
        <Typography variant="h3" fontWeight={800}>
          AI Systems Workspace
        </Typography>
        <Typography color="text.secondary" maxWidth={960}>
          Analytical models and planners inspired by efficient-AI research directions: hierarchical
          memory budgeting, quantization footprint/energy, LUT-based inference, GPU+FPGA pipeline
          splitting, and embedded-DRAM projections. Every response is an estimate derived from
          documented formulas and caller-supplied constants — not measured performance and not an
          implementation of any published system.
        </Typography>
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
          <Chip size="small" variant="outlined" color="info" label="label: analytical-estimate" />
          <Chip size="small" variant="outlined" label="assumptions + limitations on every result" />
          <Chip size="small" variant="outlined" color="warning" label="not measured, not a benchmark" />
        </Stack>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, value: TabKey) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="AI-systems models"
        >
          <Tab value="hmt" label="HMT memory" icon={<LayersIcon fontSize="small" />} iconPosition="start" />
          <Tab value="quantization" label="Quantization" icon={<CompressIcon fontSize="small" />} iconPosition="start" />
          <Tab value="lut" label="LUT inference" icon={<TableChartIcon fontSize="small" />} iconPosition="start" />
          <Tab value="hybrid" label="GPU + FPGA hybrid" icon={<HubIcon fontSize="small" />} iconPosition="start" />
          <Tab value="memory-tech" label="Memory tech" icon={<StorageIcon fontSize="small" />} iconPosition="start" />
        </Tabs>
      </Box>

      <Box sx={{ pt: 3, display: tab === 'hmt' ? 'block' : 'none' }}>
        <HmtPanel />
      </Box>
      <Box sx={{ pt: 3, display: tab === 'quantization' ? 'block' : 'none' }}>
        <QuantizationPanel />
      </Box>
      <Box sx={{ pt: 3, display: tab === 'lut' ? 'block' : 'none' }}>
        <LutPanel />
      </Box>
      <Box sx={{ pt: 3, display: tab === 'hybrid' ? 'block' : 'none' }}>
        <HybridPanel />
      </Box>
      <Box sx={{ pt: 3, display: tab === 'memory-tech' ? 'block' : 'none' }}>
        <MemoryTechPanel />
      </Box>
    </Container>
  );
}
