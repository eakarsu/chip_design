'use client';

/**
 * Cell hierarchy tree — KLayout's "Cells" sidebar equivalent.
 *
 * Renders the SREF/AREF tree built by `buildCellHierarchy`. The host page
 * controls which cell is "current" (used as the viewer's top cell); a click
 * on a node sends it back through `onSelect`. Cycle nodes are flagged so the
 * user sees recursive references without us blowing the stack.
 */

import { useState } from 'react';
import { Box, Typography, IconButton, Stack, Chip } from '@mui/material';
import { ChevronRight, ExpandMore, ReportProblem, Memory } from '@mui/icons-material';
import type { CellHierarchyNode } from '@/lib/klayout/flatten';

interface Props {
  root: CellHierarchyNode | null;
  selectedPath?: string | null;
  onSelect?: (node: CellHierarchyNode) => void;
}

export default function CellHierarchyTree({ root, selectedPath, onSelect }: Props) {
  if (!root) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>
        No top cell available.
      </Typography>
    );
  }
  return (
    <Box sx={{ p: 1, overflowY: 'auto', height: '100%' }}>
      <NodeRow
        node={root}
        depth={0}
        selectedPath={selectedPath}
        onSelect={onSelect}
        defaultExpanded
      />
    </Box>
  );
}

interface RowProps {
  node: CellHierarchyNode;
  depth: number;
  selectedPath?: string | null;
  onSelect?: (node: CellHierarchyNode) => void;
  defaultExpanded?: boolean;
}

function NodeRow({ node, depth, selectedPath, onSelect, defaultExpanded }: RowProps) {
  const [open, setOpen] = useState<boolean>(!!defaultExpanded);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedPath === node.path;

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        sx={{
          pl: depth * 1.5,
          py: 0.25,
          borderRadius: 0.5,
          cursor: 'pointer',
          bgcolor: isSelected ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => onSelect?.(node)}
      >
        <IconButton
          size="small"
          sx={{ p: 0, visibility: hasChildren ? 'visible' : 'hidden' }}
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        >
          {open ? <ExpandMore fontSize="inherit" /> : <ChevronRight fontSize="inherit" />}
        </IconButton>
        <Memory fontSize="inherit" sx={{ color: node.cyclic ? 'error.main' : 'primary.main' }} />
        <Typography
          variant="body2"
          sx={{
            fontFamily: 'monospace',
            fontSize: 13,
            flexShrink: 0,
            color: node.cyclic ? 'error.main' : 'inherit',
          }}
        >
          {node.name}
        </Typography>
        {node.instanceCount > 1 && (
          <Chip size="small" label={`×${node.instanceCount}`} sx={{ height: 16, fontSize: 10 }} />
        )}
        {node.cyclic && (
          <ReportProblem fontSize="inherit" sx={{ color: 'error.main', ml: 0.5 }} />
        )}
        <Box sx={{ flex: 1 }} />
        {node.ownShapes > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            {node.ownShapes} shapes
          </Typography>
        )}
      </Stack>
      {open && hasChildren && (
        <Box>
          {node.children.map(c => (
            <NodeRow
              key={c.path}
              node={c}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
