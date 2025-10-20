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

interface HistogramProps {
  title: string;
  data: number[];
  bins?: number;
  height?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
  color?: string;
}

export default function Histogram({
  title,
  data,
  bins = 10,
  height = 300,
  xAxisLabel = 'Value',
  yAxisLabel = 'Frequency',
  color = '#3f51b5',
}: HistogramProps) {
  const theme = useTheme();

  // Calculate histogram bins
  const min = Math.min(...data);
  const max = Math.max(...data);
  const binWidth = (max - min) / bins;

  const histogram = new Array(bins).fill(0);
  const binLabels: string[] = [];

  for (let i = 0; i < bins; i++) {
    const binStart = min + i * binWidth;
    const binEnd = binStart + binWidth;
    binLabels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
  }

  data.forEach(value => {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
    histogram[binIndex]++;
  });

  const chartData = {
    labels: binLabels,
    datasets: [
      {
        label: 'Frequency',
        data: histogram,
        backgroundColor: color,
        borderColor: color,
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          title: function(context: any) {
            return `Range: ${context[0].label}`;
          },
          label: function(context: any) {
            return `Count: ${context.parsed.y}`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: xAxisLabel,
          color: theme.palette.text.secondary,
        },
        ticks: {
          color: theme.palette.text.secondary,
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          color: theme.palette.divider,
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: yAxisLabel,
          color: theme.palette.text.secondary,
        },
        ticks: {
          color: theme.palette.text.secondary,
          precision: 0,
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
        <Bar options={options} data={chartData} />
      </Box>
    </Paper>
  );
}
