'use client';

/**
 * Schematic tab: renders the SVG schematic the API generates and offers the
 * BOM CSV, wiring CSV and SPICE netlist downloads.
 *
 * These are calculated review artifacts, not vendor-tool output (the API notes
 * that EasyEDA/PSpice automation is not available).
 */
import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { apiPost } from './api';
import type { BuckDesign, Requirements, SchematicResponse } from './types';
import { EmptyNotice } from './ui';
import { downloadTextFile } from './utils';

export interface SchematicPanelProps {
  requirements: Requirements | null;
  design: BuckDesign | null;
}

export default function SchematicPanel({ requirements, design }: SchematicPanelProps) {
  const [result, setResult] = useState<SchematicResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const generate = async () => {
    if (!requirements || !design) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setResult(await apiPost<SchematicResponse>('/api/analog/schematic', { requirements, design }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Schematic generation failed');
    } finally {
      setBusy(false);
    }
  };

  const download = (kind: 'bom' | 'wiring' | 'netlist') => {
    if (!result) return;
    if (kind === 'bom') downloadTextFile('analog-bom.csv', result.bomCsv, 'text/csv');
    if (kind === 'wiring') downloadTextFile('analog-wiring.csv', result.wiringCsv, 'text/csv');
    if (kind === 'netlist') downloadTextFile('analog-design.cir', result.netlist, 'text/plain');
    setNotice(
      kind === 'bom'
        ? 'BOM CSV downloaded.'
        : kind === 'wiring'
          ? 'Wiring CSV downloaded.'
          : 'SPICE netlist downloaded.',
    );
  };

  if (!requirements || !design) {
    return <EmptyNotice>Save the requirements and run the design before generating the schematic.</EmptyNotice>;
  }

  return (
    <Stack gap={2}>
      <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center">
        <Button variant="contained" disabled={busy} onClick={() => void generate()}>
          Generate
        </Button>
        <Button size="small" variant="outlined" disabled={!result} onClick={() => download('bom')}>
          Download BOM CSV
        </Button>
        <Button size="small" variant="outlined" disabled={!result} onClick={() => download('wiring')}>
          Download wiring CSV
        </Button>
        <Button size="small" variant="outlined" disabled={!result} onClick={() => download('netlist')}>
          Download SPICE netlist
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}

      {result ? (
        <>
          <Box
            role="img"
            aria-label={`Generated schematic for ${design.ic.part}`}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, overflow: 'auto', bgcolor: 'background.paper' }}
            dangerouslySetInnerHTML={{ __html: result.svg }}
          />
          <Box>
            {result.notes.map((note) => (
              <Typography key={note} variant="caption" component="div" color="text.secondary">
                • {note}
              </Typography>
            ))}
          </Box>
        </>
      ) : (
        <EmptyNotice>
          Generate the schematic to render the converter power stage, feedback divider and compensator network.
        </EmptyNotice>
      )}
    </Stack>
  );
}
