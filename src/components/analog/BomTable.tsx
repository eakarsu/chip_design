'use client';

/**
 * Components (BOM) tab: bill of materials, calculation ledger and warnings for
 * the saved design, plus BOM-CSV and SPICE-netlist downloads.
 *
 * Downloads come from POST /api/analog/schematic, so the CSV and the netlist
 * are the same artifacts the schematic tab shows.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { apiPost } from './api';
import type { BuckDesign, Requirements, SchematicResponse } from './types';
import { EmptyNotice } from './ui';
import { downloadTextFile } from './utils';

export interface BomTableProps {
  requirements: Requirements | null;
  design: BuckDesign | null;
}

function keyParams(params: Record<string, string>): string {
  const entries = Object.entries(params);
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(', ') : '—';
}

export default function BomTable({ requirements, design }: BomTableProps) {
  const [downloadBusy, setDownloadBusy] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloadNotice, setDownloadNotice] = useState('');

  const download = async (kind: 'bom' | 'netlist') => {
    if (!requirements || !design) return;
    setDownloadBusy(kind);
    setDownloadError('');
    setDownloadNotice('');
    try {
      const result = await apiPost<SchematicResponse>('/api/analog/schematic', { requirements, design });
      if (kind === 'bom') {
        downloadTextFile('analog-bom.csv', result.bomCsv, 'text/csv');
        setDownloadNotice('BOM CSV downloaded.');
      } else {
        downloadTextFile('analog-design.cir', result.netlist, 'text/plain');
        setDownloadNotice('SPICE netlist downloaded.');
      }
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setDownloadBusy('');
    }
  };

  if (!design) {
    return <EmptyNotice>Run and save the design in the IC selection tab to see the bill of materials.</EmptyNotice>;
  }

  return (
    <Stack gap={3}>
      {design.warnings.length > 0 && (
        <Alert severity="warning">
          <Typography fontWeight={700} component="div">
            Design warnings
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {design.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </Box>
        </Alert>
      )}

      <Box>
        <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">Bill of materials</Typography>
          <Button
            size="small"
            variant="outlined"
            disabled={!requirements || downloadBusy !== ''}
            onClick={() => void download('bom')}
          >
            Download BOM CSV
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!requirements || downloadBusy !== ''}
            onClick={() => void download('netlist')}
          >
            Download netlist
          </Button>
          {downloadBusy && <CircularProgress size={18} />}
        </Stack>
        {downloadError && <Alert severity="error" sx={{ mb: 1 }}>{downloadError}</Alert>}
        {downloadNotice && <Alert severity="success" sx={{ mb: 1 }}>{downloadNotice}</Alert>}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Kind</TableCell>
                <TableCell>Part</TableCell>
                <TableCell>Vendor</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Rated</TableCell>
                <TableCell>Key parameters</TableCell>
                <TableCell>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {design.billOfMaterials.map((item) => (
                <TableRow key={`${item.kind}-${item.part}`}>
                  <TableCell>{item.kind}</TableCell>
                  <TableCell>{item.part}</TableCell>
                  <TableCell>{item.vendor}</TableCell>
                  <TableCell>{item.value}</TableCell>
                  <TableCell>{item.rated}</TableCell>
                  <TableCell>{keyParams(item.keyParams)}</TableCell>
                  <TableCell>{item.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Calculations
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Label</TableCell>
                <TableCell>Formula</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Assumptions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {design.calculations.map((calculation) => (
                <TableRow key={calculation.id}>
                  <TableCell>{calculation.label}</TableCell>
                  <TableCell>
                    <Box component="code" sx={{ fontSize: 12 }}>
                      {calculation.formula}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {calculation.value} {calculation.unit}
                  </TableCell>
                  <TableCell>
                    <Stack gap={0.5}>
                      {calculation.assumptions.map((assumption) => (
                        <Typography key={assumption} variant="caption" component="div">
                          • {assumption}
                        </Typography>
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          Values are calculated starting points with the assumptions shown; they are not measured data.
        </Typography>
      </Box>
    </Stack>
  );
}
