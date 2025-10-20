'use client';

import { Box, Paper, Typography, useTheme } from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface BarChartProps {
  title: string;
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string | string[];
      borderWidth?: number;
    }[];
  };
  height?: number;
  horizontal?: boolean;
  stacked?: boolean;
  yAxisLabel?: string;
  xAxisLabel?: string;
}

export default function BarChart({
  title,
  data,
  height = 300,
  horizontal = false,
  stacked = false,
  yAxisLabel,
  xAxisLabel,
}: BarChartProps) {
  const theme = useTheme();

  const options = {
    indexAxis: horizontal ? ('y' as const) : ('x' as const),
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
    },
    scales: {
      x: {
        stacked,
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
        stacked,
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
        <Bar options={options} data={data} />
      </Box>
    </Paper>
  );
}
