'use client';

import { useRef, useEffect } from 'react';
import { Box, Paper, Typography, useTheme, Grid, Chip } from '@mui/material';
import { PartitioningResult, Cell, Net } from '@/types/algorithms';

interface PartitionVisualizerProps {
  result: PartitioningResult;
  cells: Cell[];
  nets: Net[];
  chipWidth: number;
  chipHeight: number;
  width?: number;
  height?: number;
}

export default function PartitionVisualizer({
  result,
  cells,
  nets,
  chipWidth,
  chipHeight,
  width = 800,
  height = 600,
}: PartitionVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();

  const partitionColors = [
    '#3f51b5', '#f44336', '#4caf50', '#ff9800',
    '#9c27b0', '#00bcd4', '#ffeb3b', '#795548',
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result.partitions) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const padding = 40;
    const scale = Math.min(
      (width - 2 * padding) / chipWidth,
      (height - 2 * padding) / chipHeight
    );

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw chip boundary
    ctx.strokeStyle = theme.palette.divider;
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, padding, chipWidth * scale, chipHeight * scale);

    // Create cell to partition map
    const cellToPartition = new Map<string, number>();
    result.partitions.forEach((partition, idx) => {
      partition.forEach(cellId => {
        cellToPartition.set(cellId, idx);
      });
    });

    // Draw partition regions (background)
    result.partitions.forEach((partition, idx) => {
      const partitionCells = cells.filter(c => partition.includes(c.id));
      if (partitionCells.length === 0) return;

      // Calculate bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      partitionCells.forEach(cell => {
        if (cell.position) {
          minX = Math.min(minX, cell.position.x);
          minY = Math.min(minY, cell.position.y);
          maxX = Math.max(maxX, cell.position.x + cell.width);
          maxY = Math.max(maxY, cell.position.y + cell.height);
        }
      });

      if (minX !== Infinity) {
        const margin = 20;
        ctx.fillStyle = partitionColors[idx % partitionColors.length] + '20';
        ctx.fillRect(
          padding + (minX - margin) * scale,
          padding + (minY - margin) * scale,
          (maxX - minX + 2 * margin) * scale,
          (maxY - minY + 2 * margin) * scale
        );

        // Draw partition label
        ctx.fillStyle = theme.palette.text.primary;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          `P${idx}`,
          padding + (minX + maxX) / 2 * scale,
          padding + minY * scale - 10
        );
      }
    });

    // Draw nets crossing partitions (cut edges)
    nets.forEach(net => {
      const netCells = cells.filter(c =>
        c.pins.some(p => net.pins.includes(p.id))
      );

      const partitions = new Set(
        netCells.map(c => cellToPartition.get(c.id)).filter(p => p !== undefined)
      );

      if (partitions.size > 1) {
        // This net crosses partitions - highlight it
        netCells.forEach((cell, idx) => {
          if (idx === 0 || !cell.position) return;
          const prevCell = netCells[idx - 1];
          if (!prevCell.position) return;

          ctx.beginPath();
          ctx.moveTo(
            padding + (prevCell.position.x + prevCell.width / 2) * scale,
            padding + (prevCell.position.y + prevCell.height / 2) * scale
          );
          ctx.lineTo(
            padding + (cell.position.x + cell.width / 2) * scale,
            padding + (cell.position.y + cell.height / 2) * scale
          );
          ctx.strokeStyle = '#f44336';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }
    });

    // Draw cells
    cells.forEach(cell => {
      if (!cell.position) return;

      const partitionIdx = cellToPartition.get(cell.id);
      if (partitionIdx === undefined) return;

      const x = padding + cell.position.x * scale;
      const y = padding + cell.position.y * scale;
      const w = cell.width * scale;
      const h = cell.height * scale;

      // Draw cell
      ctx.fillStyle = partitionColors[partitionIdx % partitionColors.length];
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1.0;

      ctx.strokeStyle = theme.palette.background.paper;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      // Draw cell label
      if (w > 20 && h > 15) {
        ctx.fillStyle = theme.palette.getContrastText(partitionColors[partitionIdx % partitionColors.length]);
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cell.name || cell.id, x + w / 2, y + h / 2);
      }
    });

  }, [result, cells, nets, chipWidth, chipHeight, width, height, theme, partitionColors]);

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {result.partitions.map((partition, idx) => (
              <Chip
                key={idx}
                label={`Partition ${idx}: ${partition.length} cells`}
                sx={{
                  bgcolor: partitionColors[idx % partitionColors.length] + '40',
                  borderColor: partitionColors[idx % partitionColors.length],
                  borderWidth: 2,
                  borderStyle: 'solid',
                }}
              />
            ))}
          </Box>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Partition Layout
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Cut edges (crossing partitions): {result.cutsize} • Balance ratio: {result.balanceRatio.toFixed(2)}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
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
      </Paper>
    </Box>
  );
}
