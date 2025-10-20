'use client';

import { useRef, useEffect } from 'react';
import { Box, Paper, Typography, useTheme } from '@mui/material';

export interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
  value?: number;
  metadata?: any;
}

interface TreeVisualizerProps {
  title: string;
  data: TreeNode;
  width?: number;
  height?: number;
  nodeRadius?: number;
  showValues?: boolean;
}

export default function TreeVisualizer({
  title,
  data,
  width = 800,
  height = 600,
  nodeRadius = 20,
  showValues = true,
}: TreeVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate tree layout
    interface LayoutNode {
      node: TreeNode;
      x: number;
      y: number;
      children: LayoutNode[];
    }

    const calculateLayout = (
      node: TreeNode,
      depth: number,
      left: number,
      right: number,
      maxDepth: number
    ): LayoutNode => {
      const x = (left + right) / 2;
      const y = 50 + (depth * (height - 100)) / maxDepth;

      const children: LayoutNode[] = [];
      if (node.children && node.children.length > 0) {
        const childWidth = (right - left) / node.children.length;
        node.children.forEach((child, idx) => {
          const childLeft = left + idx * childWidth;
          const childRight = childLeft + childWidth;
          children.push(calculateLayout(child, depth + 1, childLeft, childRight, maxDepth));
        });
      }

      return { node, x, y, children };
    };

    const getMaxDepth = (node: TreeNode, depth = 0): number => {
      if (!node.children || node.children.length === 0) return depth;
      return Math.max(...node.children.map(child => getMaxDepth(child, depth + 1)));
    };

    const maxDepth = getMaxDepth(data);
    const layout = calculateLayout(data, 0, 0, width, maxDepth);

    // Draw edges first
    const drawEdges = (layoutNode: LayoutNode) => {
      layoutNode.children.forEach(child => {
        ctx.beginPath();
        ctx.moveTo(layoutNode.x, layoutNode.y);
        ctx.lineTo(child.x, child.y);
        ctx.strokeStyle = theme.palette.primary.main;
        ctx.lineWidth = 2;
        ctx.stroke();

        drawEdges(child);
      });
    };

    // Draw nodes
    const drawNodes = (layoutNode: LayoutNode) => {
      // Draw node circle
      ctx.beginPath();
      ctx.arc(layoutNode.x, layoutNode.y, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = theme.palette.primary.main;
      ctx.fill();
      ctx.strokeStyle = theme.palette.primary.dark;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw label
      ctx.fillStyle = theme.palette.text.primary;
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(layoutNode.node.label, layoutNode.x, layoutNode.y - nodeRadius - 5);

      // Draw value if exists
      if (showValues && layoutNode.node.value !== undefined) {
        ctx.fillStyle = theme.palette.background.paper;
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(layoutNode.node.value.toFixed(1), layoutNode.x, layoutNode.y);
      }

      layoutNode.children.forEach(drawNodes);
    };

    drawEdges(layout);
    drawNodes(layout);

  }, [data, width, height, nodeRadius, showValues, theme]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {title}
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
  );
}
