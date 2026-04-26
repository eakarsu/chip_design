'use client';

/**
 * LVS report viewer.
 *
 * Renders the result of `layoutVsSchematic` (verification.ts) as a
 * KLayout-equivalent LVS browser:
 *   - Top header: pass/fail summary, counts
 *   - Left: rule/violation list with severity filter + search
 *   - Right: detail pane for the selected violation, plus a netlist
 *     browser tab that lists every layout net and the cells on it.
 *
 * Pure presentation — the host page passes in the result and a
 * (optional) netlist→cells mapping.
 */

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Chip, Divider, Tabs, Tab, TextField,
  ToggleButtonGroup, ToggleButton, Paper, List, ListItem,
  ListItemButton, ListItemText, Alert,
} from '@mui/material';
import { CheckCircle, Cancel, Warning } from '@mui/icons-material';

interface LvsViolation {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedObjects: string[];
  location?: { x: number; y: number };
}

interface LvsResult {
  success: boolean;
  violations: LvsViolation[];
  errorCount: number;
  warningCount: number;
  checkedObjects: number;
  runtime: number;
}

interface NetEntry {
  name: string;
  /** Cell IDs / instance names attached to this net (from the layout). */
  members: string[];
  /** "schematic" / "layout" / "both" — origin of the net. */
  origin: 'schematic' | 'layout' | 'both';
}

interface Props {
  result: LvsResult;
  /** Net browser data — pass an empty array to hide the Nets tab. */
  nets?: NetEntry[];
  /** Optional click-through to highlight a cell in the parent layout. */
  onCellClick?: (cellId: string) => void;
}

export default function LvsReportViewer({ result, nets = [], onCellClick }: Props) {
  const [tab, setTab] = useState<'rules' | 'nets'>('rules');
  const [severity, setSeverity] = useState<'all' | 'error' | 'warning'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return result.violations
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => {
        if (severity !== 'all' && v.severity !== severity) return false;
        if (query) {
          const q = query.toLowerCase();
          if (!v.rule.toLowerCase().includes(q) &&
              !v.message.toLowerCase().includes(q) &&
              !v.affectedObjects.some(o => o.toLowerCase().includes(q))) return false;
        }
        return true;
      });
  }, [result.violations, severity, query]);

  const sel = selected !== null ? result.violations[selected] : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SummaryBanner result={result} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
        <Tab value="rules" label={`Violations (${result.violations.length})`} />
        <Tab value="nets"  label={`Nets (${nets.length})`} disabled={nets.length === 0} />
      </Tabs>
      <Divider />

      {tab === 'rules' && (
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* List */}
          <Box sx={{ width: 360, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" spacing={1} sx={{ p: 1.5 }} alignItems="center">
              <ToggleButtonGroup
                size="small" exclusive value={severity}
                onChange={(_, v) => v && setSeverity(v)}
              >
                <ToggleButton value="all">All</ToggleButton>
                <ToggleButton value="error">Err</ToggleButton>
                <ToggleButton value="warning">Warn</ToggleButton>
              </ToggleButtonGroup>
              <TextField
                size="small" placeholder="filter…" value={query}
                onChange={(e) => setQuery(e.target.value)}
                sx={{ flex: 1 }}
              />
            </Stack>
            <Divider />
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {filtered.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>
                  no violations match the current filters
                </Typography>
              )}
              <List dense disablePadding>
                {filtered.map(({ v, i }) => (
                  <ListItem key={i} disablePadding>
                    <ListItemButton
                      selected={selected === i}
                      onClick={() => setSelected(i)}
                      sx={{
                        borderLeft: 3,
                        borderColor: v.severity === 'error' ? 'error.main' : 'warning.main',
                      }}
                    >
                      <ListItemText
                        primary={v.rule}
                        primaryTypographyProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
                        secondary={v.message}
                        secondaryTypographyProps={{ sx: { fontSize: 11 }, noWrap: true }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          </Box>

          {/* Detail pane */}
          <Box sx={{ flex: 1, p: 2, overflowY: 'auto' }}>
            {!sel && (
              <Typography variant="body2" color="text.secondary">
                Select a violation to see its details.
              </Typography>
            )}
            {sel && (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    size="small" label={sel.severity}
                    color={sel.severity === 'error' ? 'error' : 'warning'}
                  />
                  <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>{sel.rule}</Typography>
                </Stack>
                <Typography>{sel.message}</Typography>
                {sel.location && (sel.location.x !== 0 || sel.location.y !== 0) && (
                  <Paper variant="outlined" sx={{ p: 1.5, fontFamily: 'monospace' }}>
                    <Typography variant="caption" color="text.secondary">Location</Typography>
                    <Typography variant="body2">
                      ({sel.location.x.toFixed(2)}, {sel.location.y.toFixed(2)})
                    </Typography>
                  </Paper>
                )}
                {sel.affectedObjects.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Affected objects ({sel.affectedObjects.length})
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                      {sel.affectedObjects.map((o, i) => (
                        <Chip
                          key={i} size="small" label={o}
                          variant="outlined"
                          sx={{ fontFamily: 'monospace' }}
                          onClick={onCellClick ? () => onCellClick(o) : undefined}
                          clickable={!!onCellClick}
                        />
                      ))}
                    </Stack>
                  </Paper>
                )}
              </Stack>
            )}
          </Box>
        </Box>
      )}

      {tab === 'nets' && (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {nets.length === 0 ? (
            <Alert severity="info" sx={{ m: 2 }}>No nets to browse.</Alert>
          ) : (
            <List dense disablePadding>
              {nets.map(n => (
                <ListItem key={n.name} divider>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography sx={{ fontFamily: 'monospace' }}>{n.name}</Typography>
                        <Chip
                          size="small"
                          label={n.origin}
                          color={n.origin === 'both' ? 'success' : n.origin === 'schematic' ? 'warning' : 'default'}
                          variant="outlined"
                        />
                        <Typography variant="caption" color="text.secondary">
                          {n.members.length} member{n.members.length === 1 ? '' : 's'}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                        {n.members.slice(0, 12).map((m, i) => (
                          <Chip
                            key={i} size="small" label={m} variant="outlined"
                            sx={{ fontFamily: 'monospace', fontSize: 10 }}
                            onClick={onCellClick ? () => onCellClick(m) : undefined}
                            clickable={!!onCellClick}
                          />
                        ))}
                        {n.members.length > 12 && (
                          <Chip size="small" label={`+${n.members.length - 12}`} variant="outlined" />
                        )}
                      </Stack>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      )}
    </Box>
  );
}

function SummaryBanner({ result }: { result: LvsResult }) {
  const ok = result.success && result.errorCount === 0;
  const Icon = ok ? CheckCircle : (result.errorCount > 0 ? Cancel : Warning);
  return (
    <Box
      sx={{
        p: 1.5,
        bgcolor: ok ? 'success.dark' : (result.errorCount > 0 ? 'error.dark' : 'warning.dark'),
        color: 'common.white',
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <Icon />
        <Typography variant="subtitle1" sx={{ flex: 1 }}>
          {ok ? 'LVS clean — circuits match' : (result.errorCount > 0 ? 'LVS FAIL' : 'LVS — warnings only')}
        </Typography>
        <Chip size="small" label={`${result.errorCount} err`} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'inherit' }} />
        <Chip size="small" label={`${result.warningCount} warn`} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'inherit' }} />
        <Chip size="small" label={`${result.checkedObjects} checked`} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'inherit' }} />
        <Chip size="small" label={`${result.runtime.toFixed(1)} ms`} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'inherit' }} />
      </Stack>
    </Box>
  );
}
