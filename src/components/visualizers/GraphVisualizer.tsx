'use client';

import { useRef, useEffect, useState } from 'react';
import { Box, Paper, Typography, useTheme, ToggleButtonGroup, ToggleButton } from '@mui/material';

export interface GraphNode {
  id: string;
  label: string;
  type?: 'input' | 'output' | 'gate' | 'default';
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight?: number;
  label?: string;
}

interface GraphVisualizerProps {
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
  directed?: boolean;
  showLabels?: boolean;
  showWeights?: boolean;
  layoutAlgorithm?: 'force' | 'hierarchical' | 'circular';
}

export default function GraphVisualizer({
  title,
  nodes,
  edges,
  width = 800,
  height = 600,
  directed = true,
  showLabels = true,
  showWeights = false,
  layoutAlgorithm = 'force',
}: GraphVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const [layout, setLayout] = useState<'force' | 'hierarchical' | 'circular'>(layoutAlgorithm);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create positions map
    const positions = new Map<string, { x: number; y: number }>();

    // Apply layout algorithm
    if (layout === 'circular') {
      // Circular layout
      const radius = Math.min(width, height) * 0.35;
      const centerX = width / 2;
      const centerY = height / 2;
      const angleStep = (2 * Math.PI) / nodes.length;

      nodes.forEach((node, idx) => {
        const angle = idx * angleStep;
        positions.set(node.id, {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        });
      });
    } else if (layout === 'hierarchical') {
      // Hierarchical layout (simple level-based)
      const levels = new Map<string, number>();
      const visited = new Set<string>();

      const calculateLevels = (nodeId: string, level: number) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        levels.set(nodeId, level);

        edges.filter(e => e.source === nodeId).forEach(edge => {
          calculateLevels(edge.target, level + 1);
        });
      };

      // Find root nodes (no incoming edges)
      const hasIncoming = new Set(edges.map(e => e.target));
      const roots = nodes.filter(n => !hasIncoming.has(n.id));
      roots.forEach(root => calculateLevels(root.id, 0));

      // Assign positions based on levels
      const maxLevel = Math.max(...Array.from(levels.values()), 0);
      const nodesPerLevel = new Map<number, string[]>();

      nodes.forEach(node => {
        const level = levels.get(node.id) || 0;
        if (!nodesPerLevel.has(level)) nodesPerLevel.set(level, []);
        nodesPerLevel.get(level)!.push(node.id);
      });

      nodesPerLevel.forEach((nodeIds, level) => {
        const y = 50 + (level / maxLevel) * (height - 100);
        const xStep = width / (nodeIds.length + 1);
        nodeIds.forEach((nodeId, idx) => {
          positions.set(nodeId, {
            x: xStep * (idx + 1),
            y,
          });
        });
      });
    } else {
      // Force-directed layout (simplified)
      // Initialize random positions
      nodes.forEach(node => {
        if (node.position) {
          positions.set(node.id, node.position);
        } else {
          positions.set(node.id, {
            x: Math.random() * (width - 100) + 50,
            y: Math.random() * (height - 100) + 50,
          });
        }
      });

      // Run simple force simulation
      const iterations = 50;
      const k = Math.sqrt((width * height) / nodes.length);

      for (let iter = 0; iter < iterations; iter++) {
        const forces = new Map<string, { x: number; y: number }>();
        nodes.forEach(node => forces.set(node.id, { x: 0, y: 0 }));

        // Repulsive forces between all nodes
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const node1 = nodes[i];
            const node2 = nodes[j];
            const pos1 = positions.get(node1.id)!;
            const pos2 = positions.get(node2.id)!;

            const dx = pos1.x - pos2.x;
            const dy = pos1.y - pos2.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const force = (k * k) / dist;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            const f1 = forces.get(node1.id)!;
            const f2 = forces.get(node2.id)!;
            f1.x += fx;
            f1.y += fy;
            f2.x -= fx;
            f2.y -= fy;
          }
        }

        // Attractive forces for edges
        edges.forEach(edge => {
          const pos1 = positions.get(edge.source)!;
          const pos2 = positions.get(edge.target)!;

          const dx = pos2.x - pos1.x;
          const dy = pos2.y - pos1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          const force = (dist * dist) / k;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          const f1 = forces.get(edge.source)!;
          const f2 = forces.get(edge.target)!;
          f1.x += fx;
          f1.y += fy;
          f2.x -= fx;
          f2.y -= fy;
        });

        // Apply forces
        nodes.forEach(node => {
          const pos = positions.get(node.id)!;
          const force = forces.get(node.id)!;
          pos.x += force.x * 0.1;
          pos.y += force.y * 0.1;

          // Keep within bounds
          pos.x = Math.max(50, Math.min(width - 50, pos.x));
          pos.y = Math.max(50, Math.min(height - 50, pos.y));
        });
      }
    }

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw edges
    edges.forEach(edge => {
      const sourcePos = positions.get(edge.source);
      const targetPos = positions.get(edge.target);
      if (!sourcePos || !targetPos) return;

      ctx.beginPath();
      ctx.moveTo(sourcePos.x, sourcePos.y);
      ctx.lineTo(targetPos.x, targetPos.y);
      ctx.strokeStyle = theme.palette.primary.light;
      ctx.lineWidth = edge.weight ? Math.max(1, edge.weight / 10) : 2;
      ctx.stroke();

      // Draw arrow if directed
      if (directed) {
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        const angle = Math.atan2(dy, dx);
        const arrowSize = 10;

        // Position arrow at edge of target node
        const nodeRadius = 20;
        const arrowX = targetPos.x - nodeRadius * Math.cos(angle);
        const arrowY = targetPos.y - nodeRadius * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
          arrowY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
          arrowY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.strokeStyle = theme.palette.primary.light;
        ctx.stroke();
      }

      // Draw weight/label
      if (showWeights && (edge.weight !== undefined || edge.label)) {
        const midX = (sourcePos.x + targetPos.x) / 2;
        const midY = (sourcePos.y + targetPos.y) / 2;

        ctx.fillStyle = theme.palette.background.paper;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = edge.label || edge.weight?.toString() || '';
        ctx.fillText(text, midX, midY);
      }
    });

    // Draw nodes
    nodes.forEach(node => {
      const pos = positions.get(node.id);
      if (!pos) return;

      const nodeRadius = 20;

      // Choose color based on type
      let nodeColor = theme.palette.primary.main;
      if (node.type === 'input') nodeColor = '#4caf50';
      else if (node.type === 'output') nodeColor = '#f44336';
      else if (node.type === 'gate') nodeColor = '#ff9800';

      // Draw node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor;
      ctx.fill();
      ctx.strokeStyle = theme.palette.background.paper;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw label
      if (showLabels) {
        ctx.fillStyle = theme.palette.text.primary;
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, pos.x, pos.y + nodeRadius + 15);
      }
    });

  }, [nodes, edges, width, height, directed, showLabels, showWeights, layout, theme]);

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          {title}
        </Typography>
        <ToggleButtonGroup
          value={layout}
          exclusive
          onChange={(_, value) => value && setLayout(value)}
          size="small"
        >
          <ToggleButton value="force">Force</ToggleButton>
          <ToggleButton value="hierarchical">Hierarchical</ToggleButton>
          <ToggleButton value="circular">Circular</ToggleButton>
        </ToggleButtonGroup>
      </Box>
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
