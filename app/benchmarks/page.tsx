'use client';

import { useState } from 'react';
import { Container, Box, Typography, Tabs, Tab, Paper } from '@mui/material';
import Hero from '@/components/Hero';
import BenchmarkTable, { BenchmarkData } from '@/components/BenchmarkTable';

const inferenceBenchmarks: BenchmarkData[] = [
  {
    model: 'NeuralChip C7',
    category: 'Cloud',
    performance: 500,
    powerEfficiency: 1.67,
    throughput: '10K img/s',
    latency: '0.8ms',
    highlight: true,
  },
  {
    model: 'NeuralChip S3',
    category: 'Server',
    performance: 300,
    powerEfficiency: 4.0,
    throughput: '6K img/s',
    latency: '1.2ms',
    highlight: true,
  },
  {
    model: 'NeuralChip V4',
    category: 'Vision',
    performance: 100,
    powerEfficiency: 6.67,
    throughput: '2K img/s',
    latency: '1.5ms',
    highlight: true,
  },
  {
    model: 'NeuralChip X1',
    category: 'Edge',
    performance: 50,
    powerEfficiency: 10.0,
    throughput: '1K img/s',
    latency: '2.0ms',
    highlight: true,
  },
  {
    model: 'Competitor A100',
    category: 'GPU',
    performance: 312,
    powerEfficiency: 1.04,
    throughput: '5.5K img/s',
    latency: '1.5ms',
  },
  {
    model: 'Competitor H100',
    category: 'GPU',
    performance: 450,
    powerEfficiency: 1.29,
    throughput: '8K img/s',
    latency: '1.0ms',
  },
  {
    model: 'Competitor TPU v4',
    category: 'TPU',
    performance: 275,
    powerEfficiency: 1.57,
    throughput: '5K img/s',
    latency: '1.8ms',
  },
];

const trainingBenchmarks: BenchmarkData[] = [
  {
    model: 'NeuralChip C7',
    category: 'Cloud',
    performance: 450,
    powerEfficiency: 1.5,
    throughput: '2.5K samples/s',
    latency: '15ms',
    highlight: true,
  },
  {
    model: 'NeuralChip S3',
    category: 'Server',
    performance: 280,
    powerEfficiency: 3.73,
    throughput: '1.8K samples/s',
    latency: '20ms',
    highlight: true,
  },
  {
    model: 'Competitor A100',
    category: 'GPU',
    performance: 300,
    powerEfficiency: 1.0,
    throughput: '2K samples/s',
    latency: '18ms',
  },
  {
    model: 'Competitor H100',
    category: 'GPU',
    performance: 420,
    powerEfficiency: 1.2,
    throughput: '2.3K samples/s',
    latency: '16ms',
  },
  {
    model: 'Competitor TPU v4',
    category: 'TPU',
    performance: 260,
    powerEfficiency: 1.49,
    throughput: '1.9K samples/s',
    latency: '22ms',
  },
];

export default function BenchmarksPage() {
  const [benchmarkTab, setBenchmarkTab] = useState<number>(0);

  return (
    <>
      <Hero
        title="Performance That Speaks for Itself"
        subtitle="Industry-leading benchmarks across inference, training, and power efficiency"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Box sx={{ mb: 6 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            Benchmark Results
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            All benchmarks measured using ResNet-50 on ImageNet with batch size 64, FP16 precision.
            Results independently verified by MLPerf v3.1.
          </Typography>
        </Box>

        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <Tabs
            value={benchmarkTab ?? 0}
            onChange={(_, newValue) => setBenchmarkTab(newValue as number)}
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '1rem',
              },
            }}
          >
            <Tab label="Inference Benchmarks" />
            <Tab label="Training Benchmarks" />
          </Tabs>

          <Box sx={{ p: 3 }}>
            <BenchmarkTable data={benchmarkTab === 0 ? inferenceBenchmarks : trainingBenchmarks} />
          </Box>
        </Paper>

        <Box sx={{ mt: 8, p: 4, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Benchmark Methodology
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            <strong>Test Configuration:</strong> All tests conducted on identical hardware configurations with comparable
            thermal solutions. Power measurements taken at the wall using calibrated power meters.
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            <strong>Software Stack:</strong> Latest stable drivers and frameworks (PyTorch 2.1, TensorFlow 2.14, CUDA 12.2)
            with manufacturer-recommended optimizations enabled.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Validation:</strong> Results verified by independent third-party testing following MLPerf submission
            guidelines. Raw data and reproduction scripts available upon request.
          </Typography>
        </Box>
      </Container>
    </>
  );
}
