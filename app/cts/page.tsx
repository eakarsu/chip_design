'use client';

/**
 * Clock-tree visualiser.
 *
 * Drives off the CTS parser in `lib/tools/cts.ts`. Two coordinated views:
 *   - Tree view: every node positioned by depth (root at top, sinks at
 *     bottom). Edge color = parent's delay; sink color = latency rank
 *     (cool → warm). Hover reveals per-node detail.
 *   - Floorplan view: nodes painted at their (x, y) positions in the design.
 *
 * The summary panel tallies skew/latency analytics from the parsed report.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Table, TableBody, TableCell, TableHead, TableRow,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { UploadFile, PlayArrow } from '@mui/icons-material';

import {
  parseCtsReport, analyseCts, layoutCtsTree,
  type CtsReport,
} from '@/lib/tools/cts';

const SAMPLE = `Number of Sinks   = 4
Number of Buffers = 2
Max Skew  = 0.150 ns
Avg Skew  = 0.072 ns
Wire length = 1.234 mm

root:   clk_root x=400 y=400
buffer: BUF_0 parent=clk_root x=300 y=300 delay=0.10
buffer: BUF_1 parent=clk_root x=500 y=300 delay=0.12
sink:   reg0/CK parent=BUF_0 x=290 y=200
sink:   reg1/CK parent=BUF_0 x=310 y=200
sink:   reg2/CK parent=BUF_1 x=490 y=200
sink:   reg3/CK parent=BUF_1 x=510 y=200 latency=0.50
`;

export default function CtsPage() {
  const [text, setText] = useState<string>(SAMPLE);
  const [report, setReport] = useState<CtsReport>(() => parseCtsReport(SAMPLE));
  const [view, setView] = useState<'tree' | 'floorplan'>('tree');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const analytics = useMemo(() => analyseCts(report), [report]);

  function parseLocal() {
    setReport(parseCtsReport(text));
    setInfo('Parsed CTS report');
  }
  async function parseRemote() {
    try {
      const r = await fetch('/api/openroad/cts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stdout: text }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setReport({ summary: j.summary, nodes: j.nodes, warnings: j.warnings });
      setInfo(`API parsed ${j.nodes.length} nodes`);
    } catch (e) {
      setError(`API parse failed: ${(e as Error).message}`);
    }
  }
  async function importFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const txt = await f.text();
      setText(txt);
      setReport(parseCtsReport(txt));
      setInfo(`Loaded ${f.name}`);
    } catch (e) {
      setError(`Load failed: ${(e as Error).message}`);
    } finally {
      ev.target.value = '';
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Paper square sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>Clock-tree visualiser</Typography>

          <Button size="small" component="label" variant="outlined" startIcon={<UploadFile />}>
            Load report
            <input hidden type="file" accept=".rpt,.txt,.log" onChange={importFile} />
          </Button>
          <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={parseLocal}>Parse</Button>
          <Button size="small" variant="outlined" onClick={parseRemote}>Parse via API</Button>
          <Button size="small" onClick={() => { setText(SAMPLE); setReport(parseCtsReport(SAMPLE)); }}>Demo</Button>

          <Divider orientation="vertical" flexItem />

          <ToggleButtonGroup
            size="small" exclusive
            value={view} onChange={(_, v) => v && setView(v)}
          >
            <ToggleButton value="tree">Tree</ToggleButton>
            <ToggleButton value="floorplan">Floorplan</ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ flex: 1 }} />
          <Chip size="small" label={`${report.nodes.length} nodes`} />
          {report.summary.maxSkew !== undefined && (
            <Chip
              size="small"
              color={(report.summary.maxSkew ?? 0) > 0.1 ? 'warning' : 'success'}
              label={`max skew: ${(report.summary.maxSkew * 1000).toFixed(1)} ps`}
            />
          )}
          {report.summary.numSinks !== undefined && (
            <Chip size="small" variant="outlined" label={`sinks: ${report.summary.numSinks}`} />
          )}
        </Stack>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: input + summary */}
        <Box sx={{ width: 380, borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto', p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Report text</Typography>
          <TextField
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline minRows={10} maxRows={20} fullWidth
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 11 } } }}
          />

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Summary</Typography>
          <Stack spacing={0.25} sx={{ fontSize: 12, fontFamily: 'monospace' }}>
            {report.summary.numSinks   !== undefined && <div>sinks:    {report.summary.numSinks}</div>}
            {report.summary.numBuffers !== undefined && <div>buffers:  {report.summary.numBuffers}</div>}
            {report.summary.maxSkew    !== undefined && <div>max skew: {(report.summary.maxSkew * 1000).toFixed(1)} ps</div>}
            {report.summary.avgSkew    !== undefined && <div>avg skew: {(report.summary.avgSkew * 1000).toFixed(1)} ps</div>}
            {report.summary.wirelength !== undefined && <div>wirelen:  {report.summary.wirelength.toFixed(3)} mm</div>}
            <Divider sx={{ my: 1 }} />
            <div>min latency:  {(analytics.minLatency * 1000).toFixed(1)} ps</div>
            <div>max latency:  {(analytics.maxLatency * 1000).toFixed(1)} ps</div>
            <div>computed skew:{(analytics.computedSkew * 1000).toFixed(1)} ps</div>
          </Stack>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Sinks</Typography>
          <Paper variant="outlined" sx={{ maxHeight: 250, overflowY: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Sink</TableCell>
                  <TableCell align="right">Latency</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...analytics.latencyBySink.entries()].map(([id, lat]) => {
                  const t = analytics.computedSkew > 0
                    ? (lat - analytics.minLatency) / analytics.computedSkew
                    : 0;
                  return (
                    <TableRow
                      key={id}
                      hover selected={id === hoverId}
                      onMouseEnter={() => setHoverId(id)}
                      onMouseLeave={() => setHoverId(null)}
                    >
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{id}</TableCell>
                      <TableCell align="right" sx={{ color: latencyColor(t) }}>
                        {(lat * 1000).toFixed(1)} ps
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>

          {report.warnings.length > 0 && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              {report.warnings.map((w, i) => (
                <Alert key={i} severity="warning" variant="outlined">{w}</Alert>
              ))}
            </Stack>
          )}
        </Box>

        {/* Right: viewer */}
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <CtsCanvas
            report={report}
            analytics={analytics}
            view={view}
            hoverId={hoverId}
            onHover={setHoverId}
          />
        </Box>
      </Box>

      {error && <Snackbar open autoHideDuration={6000} onClose={() => setError(null)} message={error} />}
      {info  && <Snackbar open autoHideDuration={3500} onClose={() => setInfo(null)}  message={info} />}
    </Box>
  );
}

// --------------------------------------------------------------------------

interface CtsCanvasProps {
  report: CtsReport;
  analytics: ReturnType<typeof analyseCts>;
  view: 'tree' | 'floorplan';
  hoverId: string | null;
  onHover: (id: string | null) => void;
}

function CtsCanvas({ report, analytics, view, hoverId, onHover }: CtsCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current.parentElement!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const positions = useMemo(() => {
    if (view === 'tree') {
      return layoutCtsTree(report, { width: size.w - 60, depthSpacing: 80 });
    }
    // Floorplan: scale (x, y) into canvas. Y is flipped (world Y up).
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const n of report.nodes) {
      if (n.x === undefined || n.y === undefined) continue;
      xMin = Math.min(xMin, n.x); xMax = Math.max(xMax, n.x);
      yMin = Math.min(yMin, n.y); yMax = Math.max(yMax, n.y);
    }
    if (!isFinite(xMin)) return new Map<string, { x: number; y: number }>();
    const m = 30;
    const w = Math.max(1, xMax - xMin);
    const h = Math.max(1, yMax - yMin);
    const sx = (size.w - 2 * m) / w;
    const sy = (size.h - 2 * m) / h;
    const s = Math.min(sx, sy);
    const ox = m + (size.w - 2 * m - w * s) / 2;
    const oy = size.h - m - (size.h - 2 * m - h * s) / 2;
    const out = new Map<string, { x: number; y: number }>();
    for (const n of report.nodes) {
      if (n.x === undefined || n.y === undefined) continue;
      out.set(n.id, { x: ox + (n.x - xMin) * s, y: oy - (n.y - yMin) * s });
    }
    return out;
  }, [report, view, size]);

  const byId = useMemo(() => {
    const m = new Map(report.nodes.map(n => [n.id, n] as const));
    return m;
  }, [report]);

  // Render
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    c.style.width = size.w + 'px';
    c.style.height = size.h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // Edges
    ctx.lineWidth = 1.2;
    for (const n of report.nodes) {
      if (!n.parent) continue;
      const a = positions.get(n.parent);
      const b = positions.get(n.id);
      if (!a || !b) continue;
      ctx.strokeStyle = hoverId && (n.id === hoverId || n.parent === hoverId)
        ? '#ef4444' : '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Nodes
    for (const n of report.nodes) {
      const p = positions.get(n.id);
      if (!p) continue;
      let fill = '#64748b';
      let r = 5;
      if (n.kind === 'root') { fill = '#0ea5e9'; r = 8; }
      else if (n.kind === 'buffer') { fill = '#f59e0b'; r = 6; }
      else if (n.kind === 'sink') {
        const lat = analytics.latencyBySink.get(n.id);
        const t = (lat !== undefined && analytics.computedSkew > 0)
          ? (lat - analytics.minLatency) / analytics.computedSkew
          : 0;
        fill = latencyColor(t);
        r = 5;
      }
      ctx.beginPath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = n.id === hoverId ? '#ef4444' : '#0f172a';
      ctx.lineWidth = n.id === hoverId ? 2 : 1;
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Hover label
    if (hoverId) {
      const node = byId.get(hoverId);
      const p = positions.get(hoverId);
      if (node && p) {
        const lines = [
          `${node.kind}: ${node.id}`,
          ...(node.parent ? [`parent: ${node.parent}`] : []),
          ...(node.delay !== undefined ? [`delay: ${(node.delay * 1000).toFixed(1)} ps`] : []),
          ...(analytics.latencyBySink.has(node.id) ? [`latency: ${(analytics.latencyBySink.get(node.id)! * 1000).toFixed(1)} ps`] : []),
        ];
        ctx.font = '11px system-ui';
        const lw = Math.max(...lines.map(s => ctx.measureText(s).width)) + 12;
        const lh = lines.length * 14 + 8;
        let bx = p.x + 10, by = p.y - lh - 8;
        if (bx + lw > size.w) bx = p.x - lw - 10;
        if (by < 0) by = p.y + 12;
        ctx.fillStyle = 'rgba(15,23,42,0.92)';
        ctx.fillRect(bx, by, lw, lh);
        ctx.fillStyle = '#f1f5f9';
        lines.forEach((s, i) => ctx.fillText(s, bx + 6, by + 16 + i * 14));
      }
    }
  }, [positions, report.nodes, hoverId, analytics, size, byId]);

  function onMove(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    let best: { id: string; d2: number } | null = null;
    for (const [id, p] of positions) {
      const dx = px - p.x, dy = py - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 64 && (!best || d2 < best.d2)) best = { id, d2 };
    }
    onHover(best?.id ?? null);
  }

  return (
    <Box sx={{ width: '100%', height: '100%', bgcolor: 'background.default' }}>
      <canvas
        ref={ref}
        style={{ display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => onHover(null)}
      />
    </Box>
  );
}

function latencyColor(t: number): string {
  // cool (low latency, blue) → warm (high latency, red)
  const stops = [
    [59, 130, 246],  // blue
    [16, 185, 129],  // green
    [245, 158, 11],  // amber
    [239, 68, 68],   // red
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)})`;
}
