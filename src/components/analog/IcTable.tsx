'use client';

/**
 * IC selection tab: ranks the curated catalog against the requirements,
 * records the chosen IC on the project, and runs the component-sizing design.
 *
 * The table renders the API's part data, scores, reasons and blockers verbatim.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Link as MuiLink,
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
import type {
  BuckDesign,
  DesignResponse,
  IcCatalogEntry,
  IcScore,
  IcSelectionResult,
  Requirements,
} from './types';
import { EmptyNotice } from './ui';
import { formatWithUnit } from './utils';

export interface IcTableProps {
  requirements: Requirements | null;
  selectedIc: IcCatalogEntry | null;
  design: BuckDesign | null;
  onSelectIc: (ic: IcCatalogEntry) => Promise<void>;
  onSaveDesign: (design: BuckDesign) => Promise<void>;
}

function frequencyRange(entry: IcCatalogEntry): string {
  const minKhz = entry.fswMinHz / 1000;
  const maxKhz = entry.fswMaxHz / 1000;
  return minKhz === maxKhz ? `${formatWithUnit(minKhz, 'kHz', 0)} fixed` : `${formatWithUnit(minKhz, 'kHz', 0)} – ${formatWithUnit(maxKhz, 'kHz', 0)}`;
}

function designRows(design: BuckDesign): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Switching frequency', formatWithUnit(design.fswHz / 1000, 'kHz', 1)],
    ['Duty cycle, nominal', formatWithUnit(design.dutyNominal * 100, '%', 1)],
    ['Inductor ripple ΔIL', formatWithUnit(design.deltaIlA, 'A', 3)],
    ['Inductance', formatWithUnit(design.inductanceH * 1e6, 'µH', 2)],
    ['Inductor peak current', formatWithUnit(design.ilPeakA, 'A', 3)],
    ['Inductor RMS current', formatWithUnit(design.ilRmsA, 'A', 3)],
    ['Output capacitance, effective', formatWithUnit(design.outputCapEffectiveF * 1e6, 'µF', 1)],
    ['Estimated output ripple', formatWithUnit(design.estimatedRippleMv, 'mV pk-pk', 1)],
    [
      'Feedback divider',
      `R1 ${formatWithUnit(design.feedbackR1Ohm, 'Ω', 0)} / R2 ${formatWithUnit(design.feedbackR2Ohm, 'Ω', 0)}`,
    ],
    [
      'Compensator (starting values)',
      `Rc ${formatWithUnit(design.compensation.rcOhm / 1000, 'kΩ', 2)}, Cc ${formatWithUnit(
        design.compensation.ccF * 1e9,
        'nF',
        2,
      )}, Cp ${design.compensation.cpF === null ? '—' : formatWithUnit(design.compensation.cpF * 1e12, 'pF', 1)}`,
    ],
    ['Loss estimate', formatWithUnit(design.losses.totalW, 'W', 3)],
    ['Efficiency estimate', formatWithUnit(design.losses.efficiencyPct, '%', 1)],
  ];
  if (design.diode) {
    rows.push([
      'Diode requirement',
      `Vr ≥ ${formatWithUnit(design.diode.requiredVrV, 'V', 1)}, If ≥ ${formatWithUnit(design.diode.requiredIfA, 'A', 3)}`,
    ]);
  }
  return rows;
}

function DesignSummary({ design, label }: { design: BuckDesign; label: string }) {
  return (
    <Stack gap={1.5}>
      <Typography variant="h6">{label}</Typography>
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
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableBody>
            {designRows(design).map(([labelText, value]) => (
              <TableRow key={labelText}>
                <TableCell sx={{ width: '42%' }}>{labelText}</TableCell>
                <TableCell>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary">
        Calculated starting point from datasheet equations. The simulation tab is the verification step.
      </Typography>
    </Stack>
  );
}

function IcRows({
  scores,
  selectedPart,
  busyPart,
  onSelect,
}: {
  scores: IcScore[];
  selectedPart: string | null;
  busyPart: string;
  onSelect: (entry: IcCatalogEntry) => void;
}) {
  return (
    <>
      {scores.map((item) => (
        <TableRow key={item.entry.part} hover>
          <TableCell>
            <Typography fontWeight={700}>{item.entry.part}</Typography>
            <Typography variant="caption" color="text.secondary">
              {item.entry.packageName}
            </Typography>
          </TableCell>
          <TableCell>{item.entry.vendor}</TableCell>
          <TableCell>
            {item.entry.inputMinV}–{item.entry.inputMaxV} V
          </TableCell>
          <TableCell>{formatWithUnit(item.entry.ioutMaxA, 'A', 2)}</TableCell>
          <TableCell>{frequencyRange(item.entry)}</TableCell>
          <TableCell>{item.entry.topology}</TableCell>
          <TableCell>{formatWithUnit(item.score, '', 1)}</TableCell>
          <TableCell>
            <Stack gap={0.5}>
              {item.reasons.map((reason) => (
                <Typography key={reason} variant="caption" component="div">
                  • {reason}
                </Typography>
              ))}
            </Stack>
          </TableCell>
          <TableCell>
            <Button
              size="small"
              variant={selectedPart === item.entry.part ? 'contained' : 'outlined'}
              disabled={busyPart !== '' || selectedPart === item.entry.part}
              onClick={() => onSelect(item.entry)}
            >
              {selectedPart === item.entry.part ? 'Selected' : 'Select'}
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function IcTable({ requirements, selectedIc, design, onSelectIc, onSaveDesign }: IcTableProps) {
  const [ranking, setRanking] = useState<IcSelectionResult | null>(null);
  const [rankingBusy, setRankingBusy] = useState(false);
  const [rankingError, setRankingError] = useState('');
  const [selectBusy, setSelectBusy] = useState('');
  const [selectError, setSelectError] = useState('');
  const [designResponse, setDesignResponse] = useState<DesignResponse | null>(null);
  const [designBusy, setDesignBusy] = useState(false);
  const [designError, setDesignError] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [designNotice, setDesignNotice] = useState('');

  const rank = async () => {
    if (!requirements) return;
    setRankingBusy(true);
    setRankingError('');
    try {
      setRanking(await apiPost<IcSelectionResult>('/api/analog/ics', { requirements }));
    } catch (error) {
      setRankingError(error instanceof Error ? error.message : 'IC ranking failed');
    } finally {
      setRankingBusy(false);
    }
  };

  const select = async (entry: IcCatalogEntry) => {
    setSelectBusy(entry.part);
    setSelectError('');
    setDesignNotice('');
    try {
      await onSelectIc(entry);
      setDesignResponse(null);
    } catch (error) {
      setSelectError(error instanceof Error ? error.message : 'Could not select this IC');
    } finally {
      setSelectBusy('');
    }
  };

  const runDesign = async () => {
    if (!requirements || !selectedIc) return;
    setDesignBusy(true);
    setDesignError('');
    setDesignNotice('');
    try {
      setDesignResponse(await apiPost<DesignResponse>('/api/analog/design', { requirements, ic: selectedIc }));
    } catch (error) {
      setDesignError(error instanceof Error ? error.message : 'Design run failed');
    } finally {
      setDesignBusy(false);
    }
  };

  const saveDesign = async () => {
    if (!designResponse) return;
    setSaveBusy(true);
    setDesignError('');
    setDesignNotice('');
    try {
      await onSaveDesign(designResponse.design);
      setDesignNotice('Design saved to the project.');
    } catch (error) {
      setDesignError(error instanceof Error ? error.message : 'Could not save the design');
    } finally {
      setSaveBusy(false);
    }
  };

  if (!requirements) {
    return (
      <EmptyNotice>
        Review and save the requirements first. IC ranking uses Vin(min/max), Vout and the load current.
      </EmptyNotice>
    );
  }

  return (
    <Stack gap={2}>
      <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center">
        <Button variant="contained" disabled={rankingBusy} onClick={() => void rank()}>
          Rank ICs
        </Button>
        {selectedIc && (
          <Button variant="outlined" disabled={designBusy} onClick={() => void runDesign()}>
            Run design
          </Button>
        )}
        {designResponse && (
          <Button variant="contained" color="success" disabled={saveBusy} onClick={() => void saveDesign()}>
            Save design
          </Button>
        )}
        {rankingBusy && <CircularProgress size={20} />}
      </Stack>

      {rankingError && <Alert severity="error">{rankingError}</Alert>}
      {selectError && <Alert severity="error">{selectError}</Alert>}
      {designError && <Alert severity="error">{designError}</Alert>}
      {designNotice && <Alert severity="success">{designNotice}</Alert>}

      {selectedIc && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Typography variant="h6">Selected IC</Typography>
              <Chip size="small" label={selectedIc.topology} />
            </Stack>
            <Typography>
              <strong>{selectedIc.part}</strong> · {selectedIc.vendor} · {selectedIc.packageName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedIc.inputMinV}–{selectedIc.inputMaxV} V input · {selectedIc.ioutMaxA} A rated ·{' '}
              {frequencyRange(selectedIc)} · Vref {selectedIc.vrefV} V
            </Typography>
            <MuiLink href={selectedIc.datasheetUrl} target="_blank" rel="noopener noreferrer" variant="body2">
              Datasheet ({selectedIc.part})
            </MuiLink>
            <Typography variant="caption" component="div" color="text.secondary">
              {selectedIc.sourceNote}
            </Typography>
          </CardContent>
        </Card>
      )}

      {ranking && (
        <>
          <Alert severity="info">
            {ranking.notes.map((note) => (
              <Typography key={note} variant="body2" component="div">
                {note}
              </Typography>
            ))}
          </Alert>
          <Typography variant="h6">Eligible candidates</Typography>
          {ranking.eligible.length === 0 ? (
            <Alert severity="warning">No catalog IC meets these requirements. See the blockers below.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Part</TableCell>
                    <TableCell>Vendor</TableCell>
                    <TableCell>Input range</TableCell>
                    <TableCell>Iout,max</TableCell>
                    <TableCell>fsw</TableCell>
                    <TableCell>Topology</TableCell>
                    <TableCell>Score</TableCell>
                    <TableCell>Reasons</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <IcRows
                    scores={ranking.eligible}
                    selectedPart={selectedIc?.part ?? null}
                    busyPart={selectBusy}
                    onSelect={(entry) => void select(entry)}
                  />
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {ranking.rejected.length > 0 && (
            <>
              <Typography variant="h6">Rejected candidates</Typography>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack gap={1.5}>
                  {ranking.rejected.map((item) => (
                    <Box key={item.entry.part}>
                      <Typography fontWeight={700}>
                        {item.entry.part} · {item.entry.vendor}
                      </Typography>
                      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                        {item.blockers.map((blocker) => (
                          <li key={blocker}>
                            <Typography variant="body2">{blocker}</Typography>
                          </li>
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Paper>
            </>
          )}
        </>
      )}

      {designResponse ? (
        <DesignSummary design={designResponse.design} label="Design run results" />
      ) : design ? (
        <DesignSummary design={design} label="Saved design" />
      ) : selectedIc ? (
        <EmptyNotice>
          Run the design to size the inductor, capacitors, feedback divider, diode and loss estimate.
        </EmptyNotice>
      ) : (
        <EmptyNotice>
          Rank the catalog, then select the converter IC for this design.
        </EmptyNotice>
      )}
    </Stack>
  );
}
