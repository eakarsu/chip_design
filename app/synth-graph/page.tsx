'use client';

/**
 * Synthesis-netlist graph viewer.
 *
 * Paste a structural Verilog netlist (Yosys post-synth output works
 * great) and the page shows a force-directed graph: ports ringed in
 * blue, gate instances in green, with edges following net connectivity.
 *
 * The layout runs once on parse; pan/zoom/drag are local state. A side
 * panel lists modules + cell-type histogram + pickable nodes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Container, Typography, Paper, Stack, Button, TextField,
  Chip, Alert, Tabs, Tab, Divider, IconButton, Tooltip,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { Search, ContentPaste, Clear, FitScreen, Refresh } from '@mui/icons-material';
import {
  parseNetlist, netlistToGraph, forceLayout,
  type NetlistAst, type NetlistGraph, type LayoutNode,
} from '@/lib/tools/netlist';

const SAMPLE = `module top(a, b, c, y);
  input a, b, c;
  output y;
  wire n1, n2;
  AND2_X1 g1 (.A(a), .B(b), .Y(n1));
  AND2_X1 g2 (.A(n1), .B(c), .Y(n2));
  INV_X1  g3 (.A(n2), .Y(y));
endmodule
`;

interface View { cx: number; cy: number; scale: number }

export default function SynthGraphPage() {
  const [verilog, setVerilog] = useState(SAMPLE);
  const [ast, setAst] = useState<NetlistAst | null>(null);
  const [graph, setGraph] = useState<NetlistGraph | null>(null);
  const [layout, setLayout] = useState<LayoutNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'cells' | 'nets'>('cells');
  const [view, setView] = useState<View>({ cx: 400, cy: 300, scale: 1 });
  const [highlight, setHighlight] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  // Cell-type histogram for the side panel.
  const cellHistogram = useMemo(() => {
    if (!ast) return [];
    const m = new Map<string, number>();
    for (const inst of ast.instances) m.set(inst.cell, (m.get(inst.cell) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [ast]);

  async function handleParse() {
    setError(null);
    try {
      const res = await fetch('/api/synth-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verilog }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'parse failed');
      setAst(json.ast);
      setGraph(json.graph);
      const lay = forceLayout(json.graph, { width: 800, height: 600, iterations: 200, seed: 1 });
      setLayout(lay);
      setView({ cx: 400, cy: 300, scale: 1 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function relayout() {
    if (!graph) return;
    const lay = forceLayout(graph, { width: 800, height: 600, iterations: 200, seed: Math.floor(Math.random() * 1000) });
    setLayout(lay);
  }

  function fit() {
    if (!layout.length) return;
    const xs = layout.map(p => p.x);
    const ys = layout.map(p => p.y);
    const xl = Math.min(...xs), xh = Math.max(...xs);
    const yl = Math.min(...ys), yh = Math.max(...ys);
    const dx = xh - xl, dy = yh - yl;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = Math.min(r.width / Math.max(dx, 1), r.height / Math.max(dy, 1)) * 0.85;
    setView({ cx: (xl + xh) / 2, cy: (yl + yh) / 2, scale: s });
  }

  function draw() {
    const c = canvasRef.current;
    if (!c || !graph) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.width / dpr, h = c.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    const posMap = new Map(layout.map(l => [l.id, l]));
    const W2S = (x: number, y: number) => ({
      sx: (x - view.cx) * view.scale + w / 2,
      sy: (y - view.cy) * view.scale + h / 2,
    });

    // Edges.
    ctx.strokeStyle = 'rgba(180,180,180,0.5)';
    ctx.lineWidth = 1;
    for (const e of graph.edges) {
      const a = posMap.get(e.source); const b = posMap.get(e.target);
      if (!a || !b) continue;
      const ps = W2S(a.x, a.y); const pe = W2S(b.x, b.y);
      ctx.beginPath(); ctx.moveTo(ps.sx, ps.sy); ctx.lineTo(pe.sx, pe.sy); ctx.stroke();
    }

    // Highlight a node's incident edges in cyan.
    if (highlight) {
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      for (const e of graph.edges) {
        if (e.source !== highlight && e.target !== highlight) continue;
        const a = posMap.get(e.source); const b = posMap.get(e.target);
        if (!a || !b) continue;
        const ps = W2S(a.x, a.y); const pe = W2S(b.x, b.y);
        ctx.beginPath(); ctx.moveTo(ps.sx, ps.sy); ctx.lineTo(pe.sx, pe.sy); ctx.stroke();
      }
    }

    // Nodes.
    for (const n of graph.nodes) {
      const p = posMap.get(n.id);
      if (!p) continue;
      const s = W2S(p.x, p.y);
      const fill = n.kind === 'port'
        ? (n.detail === 'output' ? '#ffb74d' : '#4fc3f7')
        : '#81c784';
      const r = n.kind === 'port' ? 6 : 5;
      ctx.fillStyle = fill;
      ctx.strokeStyle = highlight === n.id ? '#00e5ff' : '#222';
      ctx.lineWidth = highlight === n.id ? 3 : 1;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Label small graphs only.
      if (graph.nodes.length <= 50) {
        ctx.fillStyle = '#fff';
        ctx.font = '11px sans-serif';
        ctx.fillText(n.id, s.sx + 8, s.sy + 3);
      }
    }
  }

  useEffect(() => { draw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [graph, layout, view, highlight]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const r = el.getBoundingClientRect();
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      draw();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Typography variant="h5" gutterBottom>Synthesis-netlist graph</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Paste a post-synthesis structural Verilog netlist. The page builds a gate-graph
        and lays it out with a small Fruchterman-Reingold solver.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2">Verilog netlist</Typography>
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Load sample"><IconButton size="small" onClick={() => setVerilog(SAMPLE)}><ContentPaste fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Clear"><IconButton size="small" onClick={() => setVerilog('')}><Clear fontSize="small" /></IconButton></Tooltip>
            </Stack>
          </Stack>
          <TextField
            multiline rows={10} fullWidth value={verilog}
            onChange={e => setVerilog(e.target.value)}
            slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 12 } } }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button variant="contained" startIcon={<Search />} onClick={handleParse} disabled={!verilog.trim()}>
              Parse
            </Button>
            <Button variant="outlined" startIcon={<Refresh />} onClick={relayout} disabled={!graph}>
              Re-layout
            </Button>
            <Button variant="outlined" startIcon={<FitScreen />} onClick={fit} disabled={!layout.length}>
              Fit
            </Button>
          </Stack>
        </Paper>
      </Stack>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
        <Paper sx={{ p: 1, flex: 2 }}>
          <Stack direction="row" spacing={1} sx={{ p: 1 }}>
            <Chip size="small" label={`${graph?.nodes.length ?? 0} nodes`} />
            <Chip size="small" label={`${graph?.edges.length ?? 0} edges`} />
            <Chip size="small" label={`${Object.keys(graph?.nets ?? {}).length} nets`} />
            {ast?.module && <Chip size="small" color="primary" label={ast.module} />}
          </Stack>
          <Box ref={wrapRef} sx={{ position: 'relative', width: '100%', height: 500 }}>
            <canvas
              ref={canvasRef}
              onWheel={e => {
                e.preventDefault();
                const factor = Math.exp(-e.deltaY * 0.001);
                setView(v => ({ ...v, scale: v.scale * factor }));
              }}
              onMouseDown={e => {
                dragRef.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
              }}
              onMouseMove={e => {
                if (!dragRef.current) return;
                const dx = (e.clientX - dragRef.current.x) / view.scale;
                const dy = (e.clientY - dragRef.current.y) / view.scale;
                setView(v => ({ ...v, cx: dragRef.current!.cx - dx, cy: dragRef.current!.cy - dy }));
              }}
              onMouseUp={() => { dragRef.current = null; }}
              onMouseLeave={() => { dragRef.current = null; }}
              style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
            />
          </Box>
        </Paper>

        <Paper sx={{ p: 2, flex: 1, maxHeight: 580, overflow: 'auto' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab value="cells" label={`Cells (${cellHistogram.length})`} />
            <Tab value="nets"  label={`Nets (${Object.keys(graph?.nets ?? {}).length})`} />
          </Tabs>
          <Divider sx={{ mb: 1 }} />
          {tab === 'cells' && (
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>cell</TableCell><TableCell align="right">count</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {cellHistogram.map(([cell, n]) => (
                  <TableRow key={cell} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{cell}</TableCell>
                    <TableCell align="right">{n}</TableCell>
                  </TableRow>
                ))}
                {cellHistogram.length === 0 && (
                  <TableRow><TableCell colSpan={2} align="center" sx={{ color: 'text.secondary' }}>No cells parsed.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {tab === 'nets' && (
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>net</TableCell><TableCell align="right">fanout</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(graph?.nets ?? {})
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([net, ends]) => (
                    <TableRow key={net} hover sx={{ cursor: 'pointer' }}
                      onClick={() => setHighlight(ends[0] ?? null)}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{net}</TableCell>
                      <TableCell align="right">{ends.length}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Stack>
    </Container>
  );
}
