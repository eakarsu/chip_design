'use client';

import { useEffect, useRef } from 'react';
import { Box, Paper, Typography, useTheme } from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface LineChartProps {
  title: string;
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      borderColor?: string;
      backgroundColor?: string;
      fill?: boolean;
    }[];
  };
  height?: number;
  yAxisLabel?: string;
  xAxisLabel?: string;
}

export default function LineChart({
  title,
  data,
  height = 300,
  yAxisLabel,
  xAxisLabel,
}: LineChartProps) {
  const theme = useTheme();

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: theme.palette.text.primary,
        },
      },
      title: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: !!xAxisLabel,
          text: xAxisLabel || '',
          color: theme.palette.text.secondary,
        },
        ticks: {
          color: theme.palette.text.secondary,
        },
        grid: {
          color: theme.palette.divider,
        },
      },
      y: {
        display: true,
        title: {
          display: !!yAxisLabel,
          text: yAxisLabel || '',
          color: theme.palette.text.secondary,
        },
        ticks: {
          color: theme.palette.text.secondary,
        },
        grid: {
          color: theme.palette.divider,
        },
      },
    },
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Box sx={{ height }}>
        <Line options={options} data={data} />
      </Box>
    </Paper>
  );
}
