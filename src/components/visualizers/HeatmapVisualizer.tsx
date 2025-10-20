'use client';

import { useRef, useEffect } from 'react';
import { Box, Paper, Typography, useTheme } from '@mui/material';

interface HeatmapVisualizerProps {
  title: string;
  data: number[][];
  width?: number;
  height?: number;
  colorScale?: {
    min: string;
    mid: string;
    max: string;
  };
  showValues?: boolean;
  showLegend?: boolean;
}

export default function HeatmapVisualizer({
  title,
  data,
  width = 600,
  height = 400,
  colorScale = {
    min: '#4caf50',
    mid: '#ff9800',
    max: '#f44336',
  },
  showValues = false,
  showLegend = true,
}: HeatmapVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rows = data.length;
    const cols = data[0].length;
    const cellWidth = width / cols;
    const cellHeight = height / rows;

    // Find min and max values
    let min = Infinity;
    let max = -Infinity;
    data.forEach(row => {
      row.forEach(value => {
        min = Math.min(min, value);
        max = Math.max(max, value);
      });
    });

    // Helper to interpolate color
    const getColor = (value: number): string => {
      const normalized = (value - min) / (max - min);

      if (normalized < 0.5) {
        // Interpolate between min and mid
        const t = normalized * 2;
        return interpolateColor(colorScale.min, colorScale.mid, t);
      } else {
        // Interpolate between mid and max
        const t = (normalized - 0.5) * 2;
        return interpolateColor(colorScale.mid, colorScale.max, t);
      }
    };

    const interpolateColor = (color1: string, color2: string, t: number): string => {
      const r1 = parseInt(color1.slice(1, 3), 16);
      const g1 = parseInt(color1.slice(3, 5), 16);
      const b1 = parseInt(color1.slice(5, 7), 16);

      const r2 = parseInt(color2.slice(1, 3), 16);
      const g2 = parseInt(color2.slice(3, 5), 16);
      const b2 = parseInt(color2.slice(5, 7), 16);

      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);

      return `rgb(${r}, ${g}, ${b})`;
    };

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw heatmap
    data.forEach((row, i) => {
      row.forEach((value, j) => {
        const x = j * cellWidth;
        const y = i * cellHeight;

        ctx.fillStyle = getColor(value);
        ctx.fillRect(x, y, cellWidth, cellHeight);

        // Draw cell border
        ctx.strokeStyle = theme.palette.divider;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellWidth, cellHeight);

        // Draw value if enabled
        if (showValues && cellWidth > 30 && cellHeight > 20) {
          ctx.fillStyle = theme.palette.getContrastText(getColor(value));
          ctx.font = `${Math.min(cellWidth, cellHeight) / 3}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            value.toFixed(1),
            x + cellWidth / 2,
            y + cellHeight / 2
          );
        }
      });
    });

  }, [data, width, height, colorScale, showValues, theme]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            bgcolor: theme.palette.background.default,
            p: 2,
            borderRadius: 1,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
          />
        </Box>

        {showLegend && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Low
            </Typography>
            <Box
              sx={{
                width: 200,
                height: 20,
                background: `linear-gradient(to right, ${colorScale.min}, ${colorScale.mid}, ${colorScale.max})`,
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              High
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
