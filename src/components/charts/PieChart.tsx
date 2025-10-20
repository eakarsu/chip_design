'use client';

import { Box, Paper, Typography, useTheme } from '@mui/material';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Pie, Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface PieChartProps {
  title: string;
  data: {
    labels: string[];
    datasets: {
      label?: string;
      data: number[];
      backgroundColor?: string[];
      borderColor?: string[];
      borderWidth?: number;
    }[];
  };
  height?: number;
  doughnut?: boolean;
}

export default function PieChart({
  title,
  data,
  height = 300,
  doughnut = false,
}: PieChartProps) {
  const theme = useTheme();

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: theme.palette.text.primary,
          padding: 15,
        },
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    },
  };

  const ChartComponent = doughnut ? Doughnut : Pie;

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Box sx={{ height }}>
        <ChartComponent options={options} data={data} />
      </Box>
    </Paper>
  );
}
