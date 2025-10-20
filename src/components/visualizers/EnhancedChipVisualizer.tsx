'use client';

import { useRef, useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Slider,
  FormControlLabel,
  Switch,
  useTheme,
} from '@mui/material';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  CenterFocusStrong as CenterIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Layers as LayersIcon,
} from '@mui/icons-material';

interface EnhancedChipVisualizerProps {
  data: any;
  category: string;
  enableZoom?: boolean;
  enableLayers?: boolean;
  enableAnimation?: boolean;
  width?: number;
  height?: number;
}

export default function EnhancedChipVisualizer({
  data,
  category,
  enableZoom = true,
  enableLayers = true,
  enableAnimation = false,
  width = 900,
  height = 700,
}: EnhancedChipVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [visibleLayers, setVisibleLayers] = useState<number[]>([0, 1, 2, 3]);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [animationFrame, setAnimationFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Handle zoom
  const handleZoom = (delta: number) => {
    setZoom(prev => Math.max(0.5, Math.min(5, prev + delta)));
  };

  // Handle pan with mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!enableZoom) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !enableZoom) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (!enableZoom) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta);
  };

  // Center view
  const centerView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Animation
  useEffect(() => {
    if (!isPlaying || !enableAnimation) return;

    const maxFrames = data.convergenceData?.length || data.episodeRewards?.length || 100;
    const interval = setInterval(() => {
      setAnimationFrame(prev => (prev + 1) % maxFrames);
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, enableAnimation, data]);

  // Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply transformations
    ctx.translate(pan.x + width / 2, pan.y + height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    const padding = 40;
    const scale = 0.6;

    // Draw chip boundary
    ctx.strokeStyle = theme.palette.divider;
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(padding, padding, width - 2 * padding, height - 2 * padding);

    // Draw heatmap if enabled
    if (showHeatmap && (category === 'placement' || category === 'routing')) {
      const gridSize = 20;
      const cols = Math.floor((width - 2 * padding) / gridSize);
      const rows = Math.floor((height - 2 * padding) / gridSize);

      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const density = Math.random(); // Would be actual density calculation
          const opacity = density * 0.5;
          ctx.fillStyle = `rgba(255, 87, 34, ${opacity})`;
          ctx.fillRect(
            padding + j * gridSize,
            padding + i * gridSize,
            gridSize,
            gridSize
          );
        }
      }
    }

    // Draw placement cells
    if (category === 'placement' || category === 'floorplanning') {
      if (data.cells || data.blocks) {
        const cells = data.cells || data.blocks;
        const cellsToShow = enableAnimation
          ? cells.slice(0, Math.floor((animationFrame / 100) * cells.length))
          : cells;

        cellsToShow.forEach((cell: any) => {
          if (!cell.position) return;

          const x = padding + cell.position.x * scale;
          const y = padding + cell.position.y * scale;
          const w = cell.width * scale;
          const h = cell.height * scale;

          // Draw cell shadow for depth
          ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          ctx.shadowBlur = 4 / zoom;
          ctx.shadowOffsetX = 2 / zoom;
          ctx.shadowOffsetY = 2 / zoom;

          ctx.fillStyle = theme.palette.primary.main;
          ctx.globalAlpha = 0.8;
          ctx.fillRect(x, y, w, h);
          ctx.globalAlpha = 1.0;

          ctx.shadowColor = 'transparent';

          ctx.strokeStyle = theme.palette.primary.dark;
          ctx.lineWidth = 1 / zoom;
          ctx.strokeRect(x, y, w, h);

          // Draw label if zoomed in enough
          if (zoom > 1.5 && w > 20 && h > 15) {
            ctx.fillStyle = theme.palette.getContrastText(theme.palette.primary.main);
            ctx.font = `${10 / zoom}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.name || cell.id, x + w / 2, y + h / 2);
          }
        });
      }
    }

    // Draw routing wires with layers
    if (category === 'routing') {
      if (data.wires) {
        const layerColors = [
          theme.palette.error.main,
          theme.palette.success.main,
          theme.palette.info.main,
          theme.palette.warning.main,
        ];

        data.wires.forEach((wire: any, idx: number) => {
          const layer = wire.layer || 0;
          if (!visibleLayers.includes(layer)) return;
          if (!wire.points || wire.points.length < 2) return;

          const color = layerColors[layer % layerColors.length];
          ctx.strokeStyle = color;
          ctx.lineWidth = (wire.width || 2) / zoom;
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

          // Draw vias
          wire.points.forEach((point: any, pointIdx: number) => {
            if (pointIdx > 0 && zoom > 1) {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(
                padding + point.x * scale,
                padding + point.y * scale,
                3 / zoom,
                0,
                2 * Math.PI
              );
              ctx.fill();
            }
          });
        });
      }

      // Draw cells as pin locations
      if (data.cells) {
        data.cells.forEach((cell: any) => {
          if (!cell.position) return;

          const x = padding + cell.position.x * scale;
          const y = padding + cell.position.y * scale;
          const w = cell.width * scale;
          const h = cell.height * scale;

          ctx.fillStyle = theme.palette.grey[600];
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = theme.palette.grey[800];
          ctx.lineWidth = 1 / zoom;
          ctx.strokeRect(x, y, w, h);
        });
      }
    }

    // Restore context
    ctx.restore();

    // Draw zoom indicator
    ctx.fillStyle = theme.palette.text.secondary;
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Zoom: ${(zoom * 100).toFixed(0)}%`, 10, height - 10);

  }, [data, category, zoom, pan, visibleLayers, showHeatmap, animationFrame, enableAnimation, theme, width, height]);

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Enhanced Chip Visualization
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {enableZoom && (
            <>
              <IconButton size="small" onClick={() => handleZoom(0.2)}>
                <ZoomInIcon />
              </IconButton>
              <IconButton size="small" onClick={() => handleZoom(-0.2)}>
                <ZoomOutIcon />
              </IconButton>
              <IconButton size="small" onClick={centerView}>
                <CenterIcon />
              </IconButton>
            </>
          )}

          {enableAnimation && (
            <IconButton
              size="small"
              onClick={() => setIsPlaying(!isPlaying)}
              color={isPlaying ? 'primary' : 'default'}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </IconButton>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
                size="small"
              />
            }
            label="Heatmap"
          />
        </Box>
      </Box>

      {enableLayers && category === 'routing' && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" gutterBottom>
            Visible Layers
          </Typography>
          <ToggleButtonGroup
            value={visibleLayers}
            onChange={(_, newLayers) => newLayers.length > 0 && setVisibleLayers(newLayers)}
            size="small"
          >
            <ToggleButton value={0}>Layer 0</ToggleButton>
            <ToggleButton value={1}>Layer 1</ToggleButton>
            <ToggleButton value={2}>Layer 2</ToggleButton>
            <ToggleButton value={3}>Layer 3</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      <Box
        ref={containerRef}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          bgcolor: theme.palette.background.default,
          p: 2,
          borderRadius: 1,
          border: `1px solid ${theme.palette.divider}`,
          cursor: isDragging ? 'grabbing' : (enableZoom ? 'grab' : 'default'),
          overflow: 'hidden',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ display: 'block' }}
        />
      </Box>

      {enableAnimation && (
        <Box sx={{ mt: 2, px: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Animation Progress
          </Typography>
          <Slider
            value={animationFrame}
            onChange={(_, value) => setAnimationFrame(value as number)}
            min={0}
            max={(data.convergenceData?.length || data.episodeRewards?.length || 100) - 1}
            size="small"
          />
        </Box>
      )}
    </Paper>
  );
}
