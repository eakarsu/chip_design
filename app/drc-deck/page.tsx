'use client';

/**
 * DRC rule-deck editor.
 *
 * Authors a JSON rule deck (min_width / min_spacing / min_area / enclosure /
 * density / extension), evaluates it live against a small synthesised geometry
 * set, and supports import/export of the deck JSON. Uses the same
 * `runDrc` engine as the KLayout page so previews stay faithful.
 */

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider, IconButton,
  Tooltip, MenuItem, Select, TextField, Snackbar, Table, TableBody,
  TableCell, TableHead, TableRow, FormControlLabel, Switch,
} from '@mui/material';
import {
  Add, Delete, Save, UploadFile, PlayArrow, ContentCopy,
  ExpandMore, ExpandLess,
} from '@mui/icons-material';

import {
  defaultRule, parseRuleDeck, serializeRuleDeck, runDrc,
  type DrcRule, type DrcViolation, type Geometry, type RuleDeck,
} from '@/lib/algorithms/drc_ruledeck';

// --- Demo geometries -------------------------------------------------------

function demoGeoms(): Geometry[] {
  return [
    // L1 actives — last gap is < 50
    { id: 'L1_0', layer: 'L1', rect: { xl: 0,   yl: 0, xh: 200, yh: 100 } },
    { id: 'L1_1', layer: 'L1', rect: { xl: 220, yl: 0, xh: 420, yh: 100 } },
    { id: 'L1_2', layer: 'L1', rect: { xl: 421, yl: 0, xh: 600, yh: 100 } },
    // L2 poly
    { id: 'L2_0', layer: 'L2', rect: { xl: 80,  yl: -40, xh: 110, yh: 140 } },
    { id: 'L2_1', layer: 'L2', rect: { xl: 300, yl: -40, xh: 330, yh: 140 } },
    // L3 met1
    { id: 'L3_0', layer: 'L3', rect: { xl: 0, yl: 200, xh: 800, yh: 250 } },
    // L3 thin sliver — tripped by min_width
    { id: 'L3_1', layer: 'L3', rect: { xl: 0, yl: 280, xh: 800, yh: 282 } },
    // VIA + enclosing M1 (via1 ⊂ metal1)
    { id: 'V1_0', layer: 'VIA1',   rect: { xl: 100, yl: 220, xh: 110, yh: 230 } },
    { id: 'M1_0', layer: 'METAL1', rect: { xl: 95,  yl: 215, xh: 115, yh: 235 } },
  ];
}

const STARTER_DECK: RuleDeck = {
  name: 'demo_drc',
  technology: 'demo',
  version: '0.1',
  rules: [
    { kind: 'min_width',   layer: 'L1', min: 80,   name: 'L1.W.1' },
    { kind: 'min_spacing', layer: 'L1', min: 50,   name: 'L1.S.1' },
    { kind: 'min_area',    layer: 'L3', min: 5000, name: 'L3.A.1' },
    { kind: 'enclosure',   inner: 'VIA1', outer: 'METAL1', min: 5, name: 'V1.E.1' },
  ],
};

const ALL_KINDS: DrcRule['kind'][] = [
  'min_width', 'min_spacing', 'min_area', 'enclosure', 'density', 'extension',
];

function blankRule(kind: DrcRule['kind']): DrcRule {
  switch (kind) {
    case 'min_width':   return defaultRule('min_width');
    case 'min_spacing': return defaultRule('min_spacing');
    case 'min_area':    return defaultRule('min_area');
    case 'enclosure':   return { kind, inner: 'VIA1', outer: 'METAL1', min: 5, name: 'V1.E.1' };
    case 'density':     return { kind, layer: 'L1', window: 100, min: 0.2, max: 0.8, name: 'L1.D.1' };
    case 'extension':   return { kind, layer: 'METAL1', over: 'VIA1', min: 5, name: 'M1.X.1' };
  }
}

export default function DrcDeckPage() {
  const [deck, setDeck] = useState<RuleDeck>(STARTER_DECK);
  const [geoms, setGeoms] = useState<Geometry[]>(demoGeoms());
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState<boolean>(false);
  const [jsonText, setJsonText] = useState<string>(serializeRuleDeck(STARTER_DECK));
  const [autorun, setAutorun] = useState<boolean>(true);
  const [geomsText, setGeomsText] = useState<string>(JSON.stringify(demoGeoms(), null, 2));

  // --- live DRC report -----------------------------------------------------

  const report = useMemo(() => {
    if (!autorun) return null;
    return runDrc(deck, geoms);
  }, [deck, geoms, autorun]);

  const [manualReport, setManualReport] = useState<{ violations: DrcViolation[]; geometryCount: number; runtimeMs: number } | null>(null);
  const effective = report ?? manualReport;

  function patchDeck(p: Partial<RuleDeck>) {
    const d = { ...deck, ...p };
    setDeck(d);
    setJsonText(serializeRuleDeck(d));
  }

  function setRule(idx: number, rule: DrcRule) {
    const rules = deck.rules.slice();
    rules[idx] = rule;
    patchDeck({ rules });
  }

  function addRule(kind: DrcRule['kind']) {
    patchDeck({ rules: [...deck.rules, blankRule(kind)] });
  }

  function removeRule(idx: number) {
    patchDeck({ rules: deck.rules.filter((_, i) => i !== idx) });
  }

  // --- JSON editor sync ----------------------------------------------------

  function applyJson() {
    try {
      const d = parseRuleDeck(jsonText);
      setDeck(d);
      setInfo('Deck JSON applied');
    } catch (e) {
      setError(`Invalid deck JSON: ${(e as Error).message}`);
    }
  }

  function applyGeomsJson() {
    try {
      const arr = JSON.parse(geomsText);
      if (!Array.isArray(arr)) throw new Error('expected array');
      setGeoms(arr as Geometry[]);
      setInfo('Geometries applied');
    } catch (e) {
      setError(`Invalid geometries JSON: ${(e as Error).message}`);
    }
  }

  function exportDeck() {
    const blob = new Blob([serializeRuleDeck(deck)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${deck.name || 'deck'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setInfo('Exported deck');
  }

  async function importDeck(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const d = parseRuleDeck(text);
      setDeck(d);
      setJsonText(serializeRuleDeck(d));
      setInfo(`Imported ${f.name}`);
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    } finally {
      ev.target.value = '';
    }
  }

  async function runRemote() {
    try {
      const r = await fetch('/api/drc/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deck, geometries: geoms }),
      });
      if (!r.ok) throw new Error(await r.text());
      const rep = await r.json();
      setManualReport(rep);
      setInfo(`API DRC: ${rep.violations.length} violations in ${rep.runtimeMs}ms`);
    } catch (e) {
      setError(`/api/drc/run failed: ${(e as Error).message}`);
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Paper square sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>DRC rule-deck editor</Typography>

          <TextField
            size="small" label="Deck name" value={deck.name}
            onChange={(e) => patchDeck({ name: e.target.value })}
            sx={{ width: 180 }}
          />
          <TextField
            size="small" label="Technology" value={deck.technology}
            onChange={(e) => patchDeck({ technology: e.target.value })}
            sx={{ width: 150 }}
          />
          <TextField
            size="small" label="Version" value={deck.version ?? ''}
            onChange={(e) => patchDeck({ version: e.target.value })}
            sx={{ width: 120 }}
          />

          <Divider orientation="vertical" flexItem />

          <Button size="small" component="label" variant="outlined" startIcon={<UploadFile />}>
            Import
            <input hidden type="file" accept=".json,application/json" onChange={importDeck} />
          </Button>
          <Button size="small" variant="outlined" startIcon={<Save />} onClick={exportDeck}>
            Export
          </Button>
          <Button
            size="small" variant="outlined" startIcon={<ContentCopy />}
            onClick={() => { navigator.clipboard.writeText(serializeRuleDeck(deck)); setInfo('Copied to clipboard'); }}
          >
            Copy JSON
          </Button>

          <Divider orientation="vertical" flexItem />

          <Button size="small" variant="contained" color="warning" startIcon={<PlayArrow />} onClick={runRemote}>
            Run via API
          </Button>
          <FormControlLabel
            control={<Switch checked={autorun} onChange={(e) => setAutorun(e.target.checked)} />}
            label="Live"
          />

          <Box sx={{ flex: 1 }} />
          <Chip size="small" label={`${deck.rules.length} rules`} />
          <Chip size="small" label={`${geoms.length} geoms`} />
          {effective && (
            <Chip
              size="small"
              color={effective.violations.length === 0 ? 'success' : 'error'}
              label={`${effective.violations.length} violations`}
            />
          )}
        </Stack>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: rule list */}
        <Box sx={{ width: '52%', borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto', p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Typography variant="subtitle1">Rules</Typography>
            <Box sx={{ flex: 1 }} />
            <Select
              size="small" value="" displayEmpty
              onChange={(e) => addRule(e.target.value as DrcRule['kind'])}
              sx={{ minWidth: 180 }}
              renderValue={(v) => v ? String(v) : <em>+ add rule</em>}
            >
              {ALL_KINDS.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
            </Select>
          </Stack>

          <Stack spacing={1.5}>
            {deck.rules.map((r, i) => (
              <RuleCard
                key={i} index={i} rule={r}
                onChange={(rr) => setRule(i, rr)}
                onDelete={() => removeRule(i)}
              />
            ))}
            {deck.rules.length === 0 && (
              <Alert severity="info">Empty deck. Use the dropdown above to add a rule.</Alert>
            )}
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle2">Deck JSON</Typography>
            <IconButton size="small" onClick={() => setShowJson(s => !s)}>
              {showJson ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          </Stack>
          {showJson && (
            <Stack spacing={1} sx={{ mt: 1 }}>
              <TextField
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                multiline minRows={6} maxRows={18}
                slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }}
              />
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={applyJson}>Apply</Button>
                <Button size="small" onClick={() => setJsonText(serializeRuleDeck(deck))}>Reset to current</Button>
              </Stack>
            </Stack>
          )}
        </Box>

        {/* Right: geometries + violations */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Violations</Typography>
          {!effective || effective.violations.length === 0 ? (
            <Alert severity="success">No violations against the current deck.</Alert>
          ) : (
            <Paper variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Rule</TableCell>
                    <TableCell>Kind</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Geometries</TableCell>
                    <TableCell>Message</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {effective.violations.map((v, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{v.ruleName}</TableCell>
                      <TableCell><Chip size="small" label={v.kind} /></TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={v.severity === 'error' ? 'error' : 'warning'}
                          label={v.severity}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {v.geometries.join(', ') || '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{v.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle1" sx={{ mb: 1 }}>Geometries (preview)</Typography>
          <Typography variant="caption" color="text.secondary">
            Edit JSON below — used by both live preview and the API run button.
          </Typography>
          <TextField
            value={geomsText}
            onChange={(e) => setGeomsText(e.target.value)}
            multiline minRows={6} maxRows={20}
            fullWidth sx={{ mt: 1 }}
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" variant="contained" onClick={applyGeomsJson}>Apply</Button>
            <Button size="small" onClick={() => setGeomsText(JSON.stringify(demoGeoms(), null, 2))}>Reset demo</Button>
          </Stack>
        </Box>
      </Box>

      {error && <Snackbar open autoHideDuration={6000} onClose={() => setError(null)} message={error} />}
      {info  && <Snackbar open autoHideDuration={3500} onClose={() => setInfo(null)}  message={info} />}
    </Box>
  );
}

// --------------------------------------------------------------------------

interface RuleCardProps {
  index: number;
  rule: DrcRule;
  onChange: (r: DrcRule) => void;
  onDelete: () => void;
}

function RuleCard({ index, rule, onChange, onDelete }: RuleCardProps) {
  const setName = (name: string) => onChange({ ...rule, name });

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Chip size="small" color="primary" label={rule.kind} />
        <TextField
          size="small" label="Name"
          value={rule.name ?? ''}
          onChange={(e) => setName(e.target.value)}
          sx={{ width: 160 }}
        />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Delete rule">
          <IconButton size="small" onClick={onDelete}><Delete fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
        {rule.kind === 'min_width' || rule.kind === 'min_spacing' || rule.kind === 'min_area' ? (
          <>
            <TextField
              size="small" label="Layer" value={rule.layer}
              onChange={(e) => onChange({ ...rule, layer: e.target.value })}
              sx={{ width: 120 }}
            />
            <TextField
              size="small" label="Min" type="number" value={rule.min}
              onChange={(e) => onChange({ ...rule, min: Number(e.target.value) })}
              sx={{ width: 120 }}
            />
          </>
        ) : null}

        {rule.kind === 'enclosure' && (
          <>
            <TextField size="small" label="Inner" value={rule.inner}
              onChange={(e) => onChange({ ...rule, inner: e.target.value })}
              sx={{ width: 120 }}
            />
            <TextField size="small" label="Outer" value={rule.outer}
              onChange={(e) => onChange({ ...rule, outer: e.target.value })}
              sx={{ width: 120 }}
            />
            <TextField size="small" label="Min margin" type="number" value={rule.min}
              onChange={(e) => onChange({ ...rule, min: Number(e.target.value) })}
              sx={{ width: 120 }}
            />
          </>
        )}

        {rule.kind === 'density' && (
          <>
            <TextField size="small" label="Layer" value={rule.layer}
              onChange={(e) => onChange({ ...rule, layer: e.target.value })}
              sx={{ width: 120 }}
            />
            <TextField size="small" label="Window" type="number" value={rule.window}
              onChange={(e) => onChange({ ...rule, window: Number(e.target.value) })}
              sx={{ width: 120 }}
            />
            <TextField size="small" label="Min" type="number" value={rule.min}
              onChange={(e) => onChange({ ...rule, min: Number(e.target.value) })}
              sx={{ width: 100 }}
            />
            <TextField size="small" label="Max" type="number" value={rule.max}
              onChange={(e) => onChange({ ...rule, max: Number(e.target.value) })}
              sx={{ width: 100 }}
            />
          </>
        )}

        {rule.kind === 'extension' && (
          <>
            <TextField size="small" label="Layer" value={rule.layer}
              onChange={(e) => onChange({ ...rule, layer: e.target.value })}
              sx={{ width: 120 }}
            />
            <TextField size="small" label="Over" value={rule.over}
              onChange={(e) => onChange({ ...rule, over: e.target.value })}
              sx={{ width: 120 }}
            />
            <TextField size="small" label="Min ext" type="number" value={rule.min}
              onChange={(e) => onChange({ ...rule, min: Number(e.target.value) })}
              sx={{ width: 120 }}
            />
          </>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        rule #{index + 1}
      </Typography>
    </Paper>
  );
}
