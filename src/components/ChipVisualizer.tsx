'use client';

import { useRef, useEffect } from 'react';
import { Box, Paper, Typography } from '@mui/material';

interface ChipVisualizerProps {
  data: any;
  category: string;
}

export default function ChipVisualizer({ data, category }: ChipVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set canvas size
    const padding = 40;
    const scale = 0.6; // Scale factor to fit canvas

    // Draw chip boundary
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, padding, canvas.width - 2 * padding, canvas.height - 2 * padding);

    if (category === 'placement' || category === 'floorplanning') {
      // Draw cells
      if (data.cells || data.blocks) {
        const cells = data.cells || data.blocks;
        cells.forEach((cell: any) => {
          if (!cell.position) return;

          const x = padding + cell.position.x * scale;
          const y = padding + cell.position.y * scale;
          const w = cell.width * scale;
          const h = cell.height * scale;

          // Draw cell rectangle
          ctx.fillStyle = '#3f51b5';
          ctx.globalAlpha = 0.7;
          ctx.fillRect(x, y, w, h);
          ctx.globalAlpha = 1.0;

          ctx.strokeStyle = '#1a237e';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, w, h);

          // Draw cell label
          ctx.fillStyle = '#fff';
          ctx.font = '8px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(cell.name || cell.id, x + w / 2, y + h / 2);
        });
      }
    }

    if (category === 'routing') {
      // Draw wires
      if (data.wires) {
        const colors = ['#f44336', '#4caf50', '#2196f3', '#ff9800', '#9c27b0'];

        data.wires.forEach((wire: any, idx: number) => {
          if (!wire.points || wire.points.length < 2) return;

          ctx.strokeStyle = colors[idx % colors.length];
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.7;

          ctx.beginPath();
          ctx.moveTo(
            padding + wire.points[0].x * scale,
            padding + wire.points[0].y * scale
          );

          for (let i = 1; i < wire.points.length; i++) {
            ctx.lineTo(
              padding + wire.points[i].x * scale,
              padding + wire.points[i].y * scale
            );
          }

          ctx.stroke();
          ctx.globalAlpha = 1.0;

          // Draw connection points
          wire.points.forEach((point: any) => {
            ctx.fillStyle = colors[idx % colors.length];
            ctx.beginPath();
            ctx.arc(
              padding + point.x * scale,
              padding + point.y * scale,
              3,
              0,
              2 * Math.PI
            );
            ctx.fill();
          });
        });
      }

      // Draw cells (pins)
      if (data.cells) {
        data.cells.forEach((cell: any) => {
          if (!cell.position) return;

          const x = padding + cell.position.x * scale;
          const y = padding + cell.position.y * scale;
          const w = cell.width * scale;
          const h = cell.height * scale;

          ctx.fillStyle = '#757575';
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = '#424242';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, w, h);
        });
      }
    }

    // Draw legend
    ctx.fillStyle = '#000';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Total Cells: ${(data.cells || data.blocks || []).length}`, 10, 20);

    if (data.totalWirelength) {
      ctx.fillText(`Wirelength: ${Math.round(data.totalWirelength)}`, 10, 35);
    }

    if (data.viaCount !== undefined) {
      ctx.fillText(`Vias: ${data.viaCount}`, 200, 20);
    }

    if (data.runtime) {
      ctx.fillText(`Runtime: ${data.runtime.toFixed(2)}ms`, 200, 35);
    }

  }, [data, category]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Chip Layout Visualization
      </Typography>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          bgcolor: '#f5f5f5',
          p: 2,
          borderRadius: 1,
        }}
      >
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          style={{ border: '1px solid #ddd', backgroundColor: '#fff' }}
        />
      </Box>
    </Paper>
  );
}
