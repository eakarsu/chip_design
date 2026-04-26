'use client';

/**
 * LVS page.
 *
 * Drives the in-repo `layoutVsSchematic` algorithm. The user pastes
 * a Verilog netlist (or accepts the demo), then runs the check; the
 * viewer renders rules + nets and supports a click-through callback
 * to highlight a cell on the OpenLane LayoutViewer if the user
 * navigates back.
 */

import { useMemo, useState } from 'react';
import {
  Container, Box, Stack, Typography, Paper, Button, TextField, Tabs, Tab,
  Alert, Divider,
} from '@mui/material';
import { PlayArrow, Refresh } from '@mui/icons-material';

import { layoutVsSchematic } from '@/lib/algorithms/verification';
import { DRCLVSAlgorithm } from '@/types/algorithms';
import LvsReportViewer from '@/components/lvs/LvsReportViewer';

// --- Demo design that matches well + a deliberate mismatch demo ----------

interface DemoCase {
  name: string;
  netlist: string;
  cells: { id: string; type: string; x: number; y: number }[];
  wires: { id: string; netId: string }[];
}

const DEMO_CLEAN: DemoCase = {
  name: 'clean',
  netlist: `
module top(a, b, sel, y);
  input a, b, sel;
  output y;
  wire t1, t2;
  AND  g1 (.A(a),  .B(sel),  .Y(t1));
  AND  g2 (.A(b),  .B(sel),  .Y(t2));
  OR   g3 (.A(t1), .B(t2),   .Y(y));
endmodule`,
  cells: [
    { id: 'g1', type: 'AND', x: 0,   y: 0 },
    { id: 'g2', type: 'AND', x: 100, y: 0 },
    { id: 'g3', type: 'OR',  x: 200, y: 0 },
  ],
  wires: [
    { id: 'w_a',   netId: 'a' },
    { id: 'w_b',   netId: 'b' },
    { id: 'w_sel', netId: 'sel' },
    { id: 'w_t1',  netId: 't1' },
    { id: 'w_t2',  netId: 't2' },
    { id: 'w_y',   netId: 'y' },
  ],
};

const DEMO_BROKEN: DemoCase = {
  ...DEMO_CLEAN,
  name: 'broken (missing wire on t2, extra cell)',
  cells: [
    ...DEMO_CLEAN.cells,
    { id: 'g4_orphan', type: 'INV', x: 300, y: 0 },
  ],
  wires: DEMO_CLEAN.wires.filter(w => w.netId !== 't2').concat({
    id: 'w_strange', netId: 'foreign_net',
  }),
};

export default function LvsPage() {
  const [demo, setDemo] = useState<DemoCase>(DEMO_CLEAN);
  const [netlist, setNetlist] = useState(DEMO_CLEAN.netlist);
  const [ran, setRan] = useState(false);

  const result = useMemo(() => {
    if (!ran) return null;
    return layoutVsSchematic({
      algorithm: DRCLVSAlgorithm.LAYOUT_VS_SCHEMATIC,
      cells: demo.cells.map(c => ({
        id: c.id, name: c.id, width: 80, height: 80,
        position: { x: c.x, y: c.y },
        pins: [], type: 'standard' as const,
      })),
      wires: demo.wires.map(w => ({
        id: w.id, netId: w.netId, layer: 1,
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      })) as any,
      netlist,
    });
  }, [ran, demo, netlist]);

  // Net browser data — derive from layout wires + parsed expected nets.
  const nets = useMemo(() => {
    const layoutNets = new Map<string, string[]>();
    for (const w of demo.wires) {
      const arr = layoutNets.get(w.netId) ?? [];
      arr.push(w.id);
      layoutNets.set(w.netId, arr);
    }
    // Cheap RTL net scrape — pull every identifier following a `.NAME(` or as a
    // top-level wire/input/output decl. Good enough for the demo browser; the
    // real LVS in verification.ts uses the proper Verilog parser.
    const expected = new Set<string>();
    for (const m of netlist.matchAll(/\.\w+\(([\w\d_]+)\)/g)) expected.add(m[1]);
    for (const m of netlist.matchAll(/\b(?:input|output|wire|inout)\s+([\w\d_,\s]+);/g)) {
      for (const t of m[1].split(',')) {
        const n = t.trim();
        if (n) expected.add(n);
      }
    }
    const all = new Set([...layoutNets.keys(), ...expected]);
    return Array.from(all).sort().map(name => {
      const inLayout = layoutNets.has(name);
      const inSchema = expected.has(name);
      const origin = (inLayout && inSchema) ? 'both' : (inSchema ? 'schematic' : 'layout');
      return {
        name,
        members: layoutNets.get(name) ?? [],
        origin: origin as 'schematic' | 'layout' | 'both',
      };
    });
  }, [demo.wires, netlist]);

  return (
    <Container maxWidth={false} sx={{ py: 2, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">Layout vs. Schematic</Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined" size="small"
          onClick={() => { setDemo(DEMO_CLEAN); setNetlist(DEMO_CLEAN.netlist); setRan(false); }}
        >
          Clean demo
        </Button>
        <Button
          variant="outlined" size="small" color="warning"
          onClick={() => { setDemo(DEMO_BROKEN); setNetlist(DEMO_BROKEN.netlist); setRan(false); }}
        >
          Broken demo
        </Button>
        <Button
          variant="contained" size="small" startIcon={<PlayArrow />}
          onClick={() => setRan(true)}
        >
          Run LVS
        </Button>
      </Stack>

      <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
        <Paper sx={{ width: 460, p: 2, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Schematic (Verilog)</Typography>
          <TextField
            value={netlist}
            onChange={(e) => setNetlist(e.target.value)}
            multiline minRows={14}
            fullWidth
            sx={{ flex: 1, '& textarea': { fontFamily: 'monospace', fontSize: 12 } }}
          />
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2">Layout</Typography>
          <Typography variant="caption" color="text.secondary">
            {demo.cells.length} cells · {demo.wires.length} wires · case={demo.name}
          </Typography>
        </Paper>

        <Paper sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {!result ? (
            <Alert severity="info" sx={{ m: 2 }}>
              Press <b>Run LVS</b> to compare the layout against the schematic. The
              broken-demo button intentionally drops a wire and adds an unconnected
              cell so the report has something to show.
            </Alert>
          ) : (
            <LvsReportViewer result={result as any} nets={nets} />
          )}
        </Paper>
      </Box>
    </Container>
  );
}
