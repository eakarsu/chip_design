'use client';

import { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Box, Text } from '@react-three/drei';
import { Box as MuiBox, Paper, Typography, ToggleButtonGroup, ToggleButton, Slider, FormControlLabel, Switch } from '@mui/material';
import * as THREE from 'three';

interface Cell3DProps {
  cell: {
    id: string;
    position: { x: number; y: number };
    width: number;
    height: number;
    layer?: number;
  };
  chipWidth: number;
  chipHeight: number;
  maxZ: number;
  isSelected: boolean;
  onSelect: () => void;
}

function Cell3D({ cell, chipWidth, chipHeight, maxZ, isSelected, onSelect }: Cell3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const outlineRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Convert chip coordinates to 3D coordinates
  const x = (cell.position.x / chipWidth) * 10 - 5;
  const z = (cell.position.y / chipHeight) * 10 - 5;
  const y = ((cell.layer || 0) / maxZ) * 3;
  const width = (cell.width / chipWidth) * 10;
  const depth = (cell.height / chipHeight) * 10;
  const height = 0.3;

  // Color based on layer
  const layerColors = ['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'];
  const color = layerColors[(cell.layer || 0) % layerColors.length];

  useFrame(() => {
    if (meshRef.current && (hovered || isSelected)) {
      meshRef.current.position.y = y + 0.15 * Math.sin(Date.now() * 0.003);
    } else if (meshRef.current) {
      meshRef.current.position.y = y;
    }
  });

  return (
    <group>
      {/* Outline/Border */}
      <mesh
        ref={outlineRef}
        position={[x, y, z]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <boxGeometry args={[width + 0.05, height + 0.05, depth + 0.05]} />
        <meshBasicMaterial
          color={isSelected ? '#FFFFFF' : hovered ? '#FFD700' : color}
          opacity={isSelected ? 0.8 : hovered ? 0.6 : 0.3}
          transparent
        />
      </mesh>

      {/* Main Cell */}
      <mesh
        ref={meshRef}
        position={[x, y, z]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={color}
          opacity={isSelected ? 1 : hovered ? 0.95 : 0.85}
          transparent
          roughness={isSelected ? 0.1 : 0.3}
          metalness={isSelected ? 0.9 : 0.6}
          emissive={isSelected ? color : hovered ? color : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : hovered ? 0.1 : 0}
        />
      </mesh>

      {/* Label - always show for selected, show on hover for others */}
      {(hovered || isSelected) && (
        <Text
          position={[x, y + height + 0.4, z]}
          fontSize={0.25}
          color={isSelected ? '#FFFFFF' : '#FFD700'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {cell.id}
        </Text>
      )}
    </group>
  );
}

interface Wire3DProps {
  points: Array<{ x: number; y: number }>;
  chipWidth: number;
  chipHeight: number;
  layer?: number;
}

function Wire3D({ points, chipWidth, chipHeight, layer = 0 }: Wire3DProps) {
  const points3D = points.map(p => new THREE.Vector3(
    (p.x / chipWidth) * 10 - 5,
    (layer / 5) * 3 + 0.15,
    (p.y / chipHeight) * 10 - 5
  ));

  const curve = new THREE.CatmullRomCurve3(points3D);
  const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.03, 8, false);

  return (
    <mesh geometry={tubeGeometry}>
      <meshStandardMaterial color="#F59E0B" opacity={0.7} transparent />
    </mesh>
  );
}

function ChipBase() {
  return (
    <>
      {/* Chip substrate */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[10, 0.3, 10]} />
        <meshStandardMaterial color="#1F2937" opacity={0.3} transparent />
      </mesh>

      {/* Grid on the base */}
      <Grid
        args={[10, 10]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#475569"
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor="#64748B"
        fadeDistance={30}
        fadeStrength={1}
        followCamera={false}
        position={[0, -0.05, 0]}
      />
    </>
  );
}

interface ChipVisualizer3DProps {
  data: any;
  category: string;
}

export default function ChipVisualizer3D({ data, category }: ChipVisualizer3DProps) {
  const [viewMode, setViewMode] = useState<'3d' | 'top' | 'side'>('3d');
  const [layerFilter, setLayerFilter] = useState<number>(5);
  const [showWires, setShowWires] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const cells = data?.cells || data?.blocks || [];
  const wires = data?.wires || [];

  // Add layer information if not present
  const cellsWithLayers = cells.map((cell: any, idx: number) => ({
    ...cell,
    layer: cell.layer !== undefined ? cell.layer : idx % 5,
  }));

  const chipWidth = data?.chipWidth || 1000;
  const chipHeight = data?.chipHeight || 1000;
  const maxZ = 5;

  const filteredCells = cellsWithLayers.filter((cell: any) => cell.layer < layerFilter);
  const selectedCellData = filteredCells.find((cell: any) => cell.id === selectedCell);

  // Camera positions for different views
  const cameraPositions: Record<string, [number, number, number]> = {
    '3d': [12, 8, 12],
    'top': [0, 15, 0],
    'side': [15, 5, 0],
  };

  return (
    <MuiBox>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          3D Chip Visualization
        </Typography>

        <MuiBox sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <MuiBox>
            <Typography variant="caption" display="block" gutterBottom>
              View Mode
            </Typography>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, value) => value && setViewMode(value)}
              size="small"
            >
              <ToggleButton value="3d">3D View</ToggleButton>
              <ToggleButton value="top">Top View</ToggleButton>
              <ToggleButton value="side">Side View</ToggleButton>
            </ToggleButtonGroup>
          </MuiBox>

          <MuiBox sx={{ minWidth: 200 }}>
            <Typography variant="caption" gutterBottom>
              Visible Layers: {layerFilter}
            </Typography>
            <Slider
              value={layerFilter}
              onChange={(_, value) => setLayerFilter(value as number)}
              min={1}
              max={5}
              step={1}
              marks
              valueLabelDisplay="auto"
            />
          </MuiBox>

          <FormControlLabel
            control={
              <Switch
                checked={showWires}
                onChange={(e) => setShowWires(e.target.checked)}
              />
            }
            label="Show Wires"
          />

          <FormControlLabel
            control={
              <Switch
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
              />
            }
            label="Auto Rotate"
          />
        </MuiBox>
      </Paper>

      <Paper sx={{ height: 600, position: 'relative', overflow: 'hidden', bgcolor: '#0F172A' }}>
        <Canvas>
          <Suspense fallback={null}>
            <PerspectiveCamera
              makeDefault
              position={cameraPositions[viewMode]}
              fov={50}
            />

            <OrbitControls
              enableDamping
              dampingFactor={0.05}
              autoRotate={autoRotate}
              autoRotateSpeed={1}
              minDistance={5}
              maxDistance={30}
            />

            {/* Lighting */}
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
            <directionalLight position={[-10, -10, -5]} intensity={0.5} />
            <pointLight position={[0, 10, 0]} intensity={0.5} />

            {/* Chip base and grid */}
            <ChipBase />

            {/* Render cells */}
            {filteredCells.map((cell: any) => (
              cell.position && (
                <Cell3D
                  key={cell.id}
                  cell={cell}
                  chipWidth={chipWidth}
                  chipHeight={chipHeight}
                  maxZ={maxZ}
                  isSelected={cell.id === selectedCell}
                  onSelect={() => setSelectedCell(cell.id === selectedCell ? null : cell.id)}
                />
              )
            ))}

            {/* Render wires */}
            {showWires && wires.map((wire: any, idx: number) => (
              wire.points && wire.points.length >= 2 && (
                <Wire3D
                  key={`wire-${idx}`}
                  points={wire.points}
                  chipWidth={chipWidth}
                  chipHeight={chipHeight}
                  layer={wire.layer || 0}
                />
              )
            ))}

            {/* Axis helpers */}
            <axesHelper args={[6]} />
          </Suspense>
        </Canvas>

        {/* Stats overlay */}
        <MuiBox
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            bgcolor: 'rgba(0,0,0,0.8)',
            color: 'white',
            p: 2,
            borderRadius: 1,
            minWidth: 220,
            backdropFilter: 'blur(10px)',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, borderBottom: '1px solid rgba(255,255,255,0.2)', pb: 1 }}>
            Scene Info
          </Typography>
          <Typography variant="caption" display="block">
            Cells: {filteredCells.length} / {cellsWithLayers.length}
          </Typography>
          <Typography variant="caption" display="block">
            Wires: {wires.length}
          </Typography>
          <Typography variant="caption" display="block" sx={{ mb: 1 }}>
            Layers: {layerFilter} / {maxZ}
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 2, opacity: 0.7, fontSize: '0.7rem' }}>
            • Drag to rotate
          </Typography>
          <Typography variant="caption" display="block" sx={{ opacity: 0.7, fontSize: '0.7rem' }}>
            • Scroll to zoom
          </Typography>
          <Typography variant="caption" display="block" sx={{ opacity: 0.7, fontSize: '0.7rem' }}>
            • Click to select
          </Typography>
          <Typography variant="caption" display="block" sx={{ opacity: 0.7, fontSize: '0.7rem' }}>
            • Hover for labels
          </Typography>
        </MuiBox>

        {/* Selected Cell Info */}
        {selectedCellData && (
          <MuiBox
            sx={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              bgcolor: 'rgba(79, 70, 229, 0.95)',
              color: 'white',
              p: 2.5,
              borderRadius: 1,
              minWidth: 250,
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              border: '2px solid rgba(255,255,255,0.3)',
            }}
          >
            <MuiBox sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                Selected Cell
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.25)',
                  px: 1,
                  py: 0.5,
                  borderRadius: 0.5,
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedCell(null)}
              >
                ✕ Close
              </Typography>
            </MuiBox>
            <MuiBox sx={{ bgcolor: 'rgba(0,0,0,0.2)', p: 1.5, borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                ID: {selectedCellData.id}
              </Typography>
              <Typography variant="caption" display="block" sx={{ opacity: 0.9 }}>
                Position: ({Math.round(selectedCellData.position.x)}, {Math.round(selectedCellData.position.y)})
              </Typography>
              <Typography variant="caption" display="block" sx={{ opacity: 0.9 }}>
                Size: {Math.round(selectedCellData.width)} × {Math.round(selectedCellData.height)}
              </Typography>
              <Typography variant="caption" display="block" sx={{ opacity: 0.9 }}>
                Layer: {selectedCellData.layer || 0}
              </Typography>
              {selectedCellData.name && (
                <Typography variant="caption" display="block" sx={{ opacity: 0.9, mt: 0.5 }}>
                  Name: {selectedCellData.name}
                </Typography>
              )}
            </MuiBox>
          </MuiBox>
        )}
      </Paper>
    </MuiBox>
  );
}
