'use client';

import { Box, Paper, Typography, useTheme } from '@mui/material';
import { useEffect, useRef } from 'react';

interface GaugeChartProps {
  title: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  thresholds?: {
    value: number;
    color: string;
  }[];
}

export default function GaugeChart({
  title,
  value,
  min = 0,
  max = 100,
  unit = '%',
  thresholds = [
    { value: 33, color: '#4caf50' },
    { value: 66, color: '#ff9800' },
    { value: 100, color: '#f44336' },
  ],
}: GaugeChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height * 0.75;
    const radius = Math.min(width, height) * 0.35;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw gauge background arc
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;

    // Draw colored segments
    thresholds.forEach((threshold, idx) => {
      const prevValue = idx === 0 ? min : thresholds[idx - 1].value;
      const segmentStart = startAngle + ((prevValue - min) / (max - min)) * (endAngle - startAngle);
      const segmentEnd = startAngle + ((threshold.value - min) / (max - min)) * (endAngle - startAngle);

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, segmentStart, segmentEnd);
      ctx.lineWidth = 20;
      ctx.strokeStyle = threshold.color;
      ctx.stroke();
    });

    // Draw needle
    const normalizedValue = Math.max(min, Math.min(max, value));
    const needleAngle = startAngle + ((normalizedValue - min) / (max - min)) * (endAngle - startAngle);
    const needleLength = radius - 10;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(needleAngle) * needleLength,
      centerY + Math.sin(needleAngle) * needleLength
    );
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.palette.text.primary;
    ctx.stroke();

    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = theme.palette.text.primary;
    ctx.fill();

    // Draw value text
    ctx.fillStyle = theme.palette.text.primary;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${value.toFixed(1)}${unit}`, centerX, centerY + 40);

    // Draw min/max labels
    ctx.font = '12px Arial';
    ctx.fillStyle = theme.palette.text.secondary;
    ctx.textAlign = 'left';
    ctx.fillText(min.toString(), centerX - radius - 10, centerY + 5);
    ctx.textAlign = 'right';
    ctx.fillText(max.toString(), centerX + radius + 10, centerY + 5);

  }, [value, min, max, unit, thresholds, theme]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom textAlign="center">
        {title}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          width={300}
          height={220}
        />
      </Box>
    </Paper>
  );
}
