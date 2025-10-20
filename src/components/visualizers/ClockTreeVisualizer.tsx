'use client';

import { useRef, useEffect } from 'react';
import { Box, Paper, Typography, useTheme, Grid, Card, CardContent } from '@mui/material';
import { ClockTreeResult } from '@/types/algorithms';

interface ClockTreeVisualizerProps {
  result: ClockTreeResult;
  width?: number;
  height?: number;
}

export default function ClockTreeVisualizer({
  result,
  width = 800,
  height = 600,
}: ClockTreeVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result.root) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw clock tree recursively
    const drawNode = (node: any, x: number, y: number, level: number, maxLevel: number, angle: number, arcSpan: number) => {
      const nodeRadius = 8;
      const levelHeight = (height - 100) / (maxLevel + 1);

      // Draw node
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = node.isSink ? '#4caf50' : theme.palette.primary.main;
      ctx.fill();
      ctx.strokeStyle = theme.palette.background.paper;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw buffer if present
      if (node.hasBuffer) {
        ctx.beginPath();
        ctx.arc(x, y, nodeRadius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw children
      if (node.children && node.children.length > 0) {
        const childY = y + levelHeight;
        const childArcSpan = arcSpan / node.children.length;

        node.children.forEach((child: any, idx: number) => {
          const childAngle = angle - arcSpan / 2 + (idx + 0.5) * childArcSpan;
          const childX = x + Math.sin(childAngle) * 80;

          // Draw edge
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(childX, childY);
          ctx.strokeStyle = theme.palette.primary.light;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Draw delay label
          if (child.delay !== undefined) {
            const midX = (x + childX) / 2;
            const midY = (y + childY) / 2;
            ctx.fillStyle = theme.palette.text.secondary;
            ctx.font = '9px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${child.delay.toFixed(2)}ns`, midX, midY - 5);
          }

          drawNode(child, childX, childY, level + 1, maxLevel, childAngle, childArcSpan);
        });
      }

      // Draw label for sink nodes
      if (node.isSink && node.id) {
        ctx.fillStyle = theme.palette.text.primary;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(node.id, x, y + nodeRadius + 12);
      }
    };

    // Calculate max depth
    const getMaxDepth = (node: any, depth = 0): number => {
      if (!node.children || node.children.length === 0) return depth;
      return Math.max(...node.children.map((c: any) => getMaxDepth(c, depth + 1)));
    };

    const maxDepth = getMaxDepth(result.root);
    const rootX = width / 2;
    const rootY = 50;

    drawNode(result.root, rootX, rootY, 0, maxDepth, 0, Math.PI);

    // Draw legend
    const legendY = height - 30;
    ctx.fillStyle = theme.palette.primary.main;
    ctx.beginPath();
    ctx.arc(20, legendY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.palette.text.primary;
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Clock Node', 35, legendY + 4);

    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.arc(140, legendY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.palette.text.primary;
    ctx.fillText('Sink', 155, legendY + 4);

    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(220, legendY, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = theme.palette.text.primary;
    ctx.fillText('Buffer', 240, legendY + 4);

  }, [result, width, height, theme]);

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Total Wirelength
              </Typography>
              <Typography variant="h5">
                {result.totalWirelength.toFixed(0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Clock Skew
              </Typography>
              <Typography variant="h5">
                {result.skew.toFixed(2)} ns
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Buffer Count
              </Typography>
              <Typography variant="h5">
                {result.bufferCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Power
              </Typography>
              <Typography variant="h5">
                {result.powerConsumption.toFixed(2)} mW
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Clock Tree Structure
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
