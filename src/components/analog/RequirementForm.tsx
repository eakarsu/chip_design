'use client';

/**
 * Buck-converter requirement form with an on-demand completeness review.
 *
 * Submitting calls POST /api/analog/requirements and renders the API's own
 * derived conditions, checks and missing-condition flags. The primary action
 * posts the raw input; the server re-validates and applies schema defaults.
 */
import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { apiPost } from './api';
import type { DerivedConditions, Requirements, RequirementsInput, RequirementsReview } from './types';
import { CheckStatusChip } from './ui';
import { formatWithUnit, issuesToText } from './utils';

interface FormState {
  name: string;
  vinNominal: string;
  vinMin: string;
  vinMax: string;
  vout: string;
  ioutMax: string;
  ioutMin: string;
  rippleMv: string;
  rippleRatio: string;
  fswHz: string;
  ambientC: string;
  efficiencyTargetPct: string;
  boardLayers: string;
  loadStepPct: string;
  transientDeviationMv: string;
  targetCrossoverHz: string;
  notes: string;
}

type NumericField = Exclude<keyof FormState, 'name' | 'notes'>;

type FieldErrors = Partial<Record<keyof FormState, string>>;

const DEFAULT_FORM: FormState = {
  name: '12 V to 5 V / 1 A buck',
  vinNominal: '12',
  vinMin: '10',
  vinMax: '14',
  vout: '5',
  ioutMax: '1',
  ioutMin: '0',
  rippleMv: '50',
  rippleRatio: '0.3',
  fswHz: '',
  ambientC: '',
  efficiencyTargetPct: '',
  boardLayers: '4',
  loadStepPct: '50',
  transientDeviationMv: '',
  targetCrossoverHz: '',
  notes: '',
};

const FIELD_HELPERS: Record<NumericField, string> = {
  vinNominal: 'Required. Nominal operating input.',
  vinMin: 'Required. Lowest input during operation.',
  vinMax: 'Required. Highest input, including transients.',
  vout: 'Required. Must stay below Vin(min) for a buck.',
  ioutMax: 'Required. Full-load current.',
  ioutMin: 'Optional. Defaults to 0 A.',
  rippleMv: 'Optional. Defaults to 50 mV pk-pk.',
  rippleRatio: 'Optional. Defaults to 0.3.',
  fswHz: 'Optional. Leave blank to use the IC range recommendation.',
  ambientC: 'Optional. Flagged as missing if omitted.',
  efficiencyTargetPct: 'Optional. Flagged as missing if omitted.',
  boardLayers: 'Optional. Defaults to 4.',
  loadStepPct: 'Optional. Defaults to 50% of Iout(max).',
  transientDeviationMv: 'Optional. Flagged as missing if omitted.',
  targetCrossoverHz: 'Optional. Used when tuning the compensator.',
};

const NUMERIC_FIELDS: Array<{ field: NumericField; label: string; required?: boolean; integer?: boolean }> = [
  { field: 'vinNominal', label: 'Input voltage, nominal (V)', required: true },
  { field: 'vinMin', label: 'Input voltage, minimum (V)', required: true },
  { field: 'vinMax', label: 'Input voltage, maximum (V)', required: true },
  { field: 'vout', label: 'Output voltage (V)', required: true },
  { field: 'ioutMax', label: 'Output current, maximum (A)', required: true },
  { field: 'ioutMin', label: 'Output current, minimum (A)' },
  { field: 'rippleMv', label: 'Output ripple budget (mV pk-pk)' },
  { field: 'rippleRatio', label: 'Inductor ripple ratio (ΔIL / Iout)' },
  { field: 'fswHz', label: 'Switching frequency (Hz)', integer: true },
  { field: 'boardLayers', label: 'PCB layers', integer: true },
  { field: 'loadStepPct', label: 'Load step (% of Iout, max)' },
  { field: 'ambientC', label: 'Ambient temperature (°C)' },
  { field: 'efficiencyTargetPct', label: 'Efficiency target (%)' },
  { field: 'transientDeviationMv', label: 'Allowed load-step deviation (mV)' },
  { field: 'targetCrossoverHz', label: 'Target crossover frequency (Hz)' },
];

function toFormState(requirements: Requirements | null | undefined): FormState {
  if (!requirements) return DEFAULT_FORM;
  const text = (value: number | undefined) => (value === undefined ? '' : String(value));
  return {
    name: requirements.name,
    vinNominal: String(requirements.vinNominal),
    vinMin: String(requirements.vinMin),
    vinMax: String(requirements.vinMax),
    vout: String(requirements.vout),
    ioutMax: String(requirements.ioutMax),
    ioutMin: text(requirements.ioutMin),
    rippleMv: text(requirements.rippleMv),
    rippleRatio: text(requirements.rippleRatio),
    fswHz: text(requirements.fswHz),
    ambientC: text(requirements.ambientC),
    efficiencyTargetPct: text(requirements.efficiencyTargetPct),
    boardLayers: text(requirements.boardLayers),
    loadStepPct: text(requirements.loadStepPct),
    transientDeviationMv: text(requirements.transientDeviationMv),
    targetCrossoverHz: text(requirements.targetCrossoverHz),
    notes: requirements.notes ?? '',
  };
}

function buildRequirements(form: FormState): { errors: FieldErrors; payload?: RequirementsInput } {
  const errors: FieldErrors = {};
  const readNumber = (
    field: NumericField,
    options: { required?: boolean; integer?: boolean; signed?: boolean; allowZero?: boolean } = {},
  ) => {
    const raw = form[field].trim();
    if (!raw) {
      if (options.required) errors[field] = 'Required';
      return undefined;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      errors[field] = 'Enter a number';
      return undefined;
    }
    if (options.integer && !Number.isInteger(value)) {
      errors[field] = 'Enter a whole number';
      return undefined;
    }
    if (!options.signed && !options.allowZero && value <= 0) {
      errors[field] = 'Must be greater than zero';
      return undefined;
    }
    if (options.allowZero && value < 0) {
      errors[field] = 'Must not be negative';
      return undefined;
    }
    return value;
  };

  const name = form.name.trim();
  if (!name) errors.name = 'A design name is required';

  const vinNominal = readNumber('vinNominal', { required: true });
  const vinMin = readNumber('vinMin', { required: true });
  const vinMax = readNumber('vinMax', { required: true });
  const vout = readNumber('vout', { required: true });
  const ioutMax = readNumber('ioutMax', { required: true });
  const ioutMin = readNumber('ioutMin', { allowZero: true });
  const rippleMv = readNumber('rippleMv');
  const rippleRatio = readNumber('rippleRatio');
  const fswHz = readNumber('fswHz', { integer: true });
  const ambientC = readNumber('ambientC', { signed: true });
  const efficiencyTargetPct = readNumber('efficiencyTargetPct');
  const boardLayers = readNumber('boardLayers', { integer: true });
  const loadStepPct = readNumber('loadStepPct');
  const transientDeviationMv = readNumber('transientDeviationMv');
  const targetCrossoverHz = readNumber('targetCrossoverHz');

  if (
    !name ||
    vinNominal === undefined ||
    vinMin === undefined ||
    vinMax === undefined ||
    vout === undefined ||
    ioutMax === undefined
  ) {
    return { errors };
  }
  if (Object.keys(errors).length) return { errors };

  const notes = form.notes.trim();
  const payload: RequirementsInput = {
    name,
    vinNominal,
    vinMin,
    vinMax,
    vout,
    ioutMax,
    ...(ioutMin !== undefined ? { ioutMin } : {}),
    ...(rippleMv !== undefined ? { rippleMv } : {}),
    ...(rippleRatio !== undefined ? { rippleRatio } : {}),
    ...(fswHz !== undefined ? { fswHz } : {}),
    ...(ambientC !== undefined ? { ambientC } : {}),
    ...(efficiencyTargetPct !== undefined ? { efficiencyTargetPct } : {}),
    ...(boardLayers !== undefined ? { boardLayers } : {}),
    ...(loadStepPct !== undefined ? { loadStepPct } : {}),
    ...(transientDeviationMv !== undefined ? { transientDeviationMv } : {}),
    ...(targetCrossoverHz !== undefined ? { targetCrossoverHz } : {}),
    ...(notes ? { notes } : {}),
  };
  return { errors, payload };
}

function derivedRows(derived: DerivedConditions): Array<[string, string]> {
  return [
    ['Duty, nominal', formatWithUnit(derived.dutyNominal * 100, '%', 1)],
    ['Duty, min / max', `${formatWithUnit(derived.dutyMin * 100, '%', 1)} / ${formatWithUnit(derived.dutyMax * 100, '%', 1)}`],
    ['Max inductor ripple ΔIL', formatWithUnit(derived.maxDeltaIl, 'A', 3)],
    ['Minimum inductance', formatWithUnit(derived.minInductanceH * 1e6, 'µH', 2)],
    ['Suggested switching frequency', formatWithUnit(derived.suggestedFswHz / 1000, 'kHz', 1)],
    ['Output power', formatWithUnit(derived.outputPowerW, 'W', 2)],
    ['Max input current', formatWithUnit(derived.maxInputCurrentA, 'A', 3)],
    ['Load step', formatWithUnit(derived.loadStepA, 'A', 3)],
  ];
}

function RequirementsReviewView({ review }: { review: RequirementsReview }) {
  return (
    <Stack gap={2} sx={{ mt: 2 }}>
      <Typography variant="h6">Derived conditions</Typography>
      <Grid container spacing={1.5}>
        {derivedRows(review.derived).map(([label, value]) => (
          <Grid key={label} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" component="div">
                  {label}
                </Typography>
                <Typography variant="subtitle1" fontWeight={700}>
                  {value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h6">Checks</Typography>
      <Stack gap={1}>
        {review.checks.map((check) => (
          <Paper key={check.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <CheckStatusChip status={check.status} />
              <Typography fontWeight={700}>{check.label}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {check.detail}
            </Typography>
          </Paper>
        ))}
      </Stack>

      <Typography variant="h6">Missing conditions</Typography>
      {review.missing.length === 0 ? (
        <Alert severity="success">The review found no missing conditions.</Alert>
      ) : (
        <Stack gap={1}>
          {review.missing.map((item) => (
            <Alert key={item.field} severity="info">
              <Typography fontWeight={700} component="span">
                {item.field}
              </Typography>{' '}
              — {item.recommendation}
            </Alert>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export interface RequirementFormProps {
  /** Parsed requirements from the project, or null for a new design. */
  initial?: Requirements | null;
  primaryLabel?: string;
  primarySuccessMessage?: string;
  onPrimaryAction?: (requirements: RequirementsInput) => Promise<void> | void;
}

export default function RequirementForm({
  initial,
  primaryLabel = 'Save requirements',
  primarySuccessMessage = 'Requirements saved.',
  onPrimaryAction,
}: RequirementFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [review, setReview] = useState<RequirementsReview | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  useEffect(() => {
    setForm(toFormState(initial));
    setFieldErrors({});
    setReview(null);
    setReviewError('');
    setActionError('');
  }, [initial]);

  const update = (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const runReview = async () => {
    const { errors, payload } = buildRequirements(form);
    setFieldErrors(errors);
    setActionNotice('');
    if (!payload) {
      setReviewError('Fix the highlighted fields before reviewing.');
      return;
    }
    setReviewBusy(true);
    setReviewError('');
    try {
      const result = await apiPost<RequirementsReview>('/api/analog/requirements', payload);
      setReview(result);
    } catch (error) {
      setReview(null);
      setReviewError(issuesToText(error instanceof Error ? error.message : 'Requirement review failed'));
    } finally {
      setReviewBusy(false);
    }
  };

  const runPrimaryAction = async () => {
    if (!onPrimaryAction) return;
    const { errors, payload } = buildRequirements(form);
    setFieldErrors(errors);
    setActionNotice('');
    if (!payload) {
      setActionError('Fix the highlighted fields before continuing.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await onPrimaryAction(payload);
      setActionNotice(primarySuccessMessage);
    } catch (error) {
      setActionError(issuesToText(error instanceof Error ? error.message : 'Request failed'));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <Box component="form" noValidate onSubmit={(event) => { event.preventDefault(); void runReview(); }}>
      <Stack gap={2}>
        <Typography variant="body2" color="text.secondary">
          Buck-converter operating conditions. Optional fields left blank are reported as missing instead of
          invented, and every derived value comes from the API review.
        </Typography>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              id="analog-req-name"
              name="name"
              label="Design name"
              value={form.name}
              onChange={update('name')}
              error={Boolean(fieldErrors.name)}
              helperText={fieldErrors.name ?? 'Shown in the project list and reviews.'}
              required
              fullWidth
            />
          </Grid>
          {NUMERIC_FIELDS.map(({ field, label, required, integer }) => (
            <Grid key={field} size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                id={`analog-req-${field}`}
                name={field}
                label={label}
                type="number"
                value={form[field]}
                onChange={update(field)}
                error={Boolean(fieldErrors[field])}
                helperText={fieldErrors[field] ?? FIELD_HELPERS[field]}
                required={required}
                fullWidth
              />
            </Grid>
          ))}
        </Grid>

        <TextField
          id="analog-req-notes"
          name="notes"
          label="Application notes"
          value={form.notes}
          onChange={update('notes')}
          helperText="Enclosure, connectors, EMI, cost ceiling — optional."
          multiline
          minRows={2}
          fullWidth
        />

        <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center">
          <Button type="submit" variant="outlined" disabled={reviewBusy}>
            Review requirements
          </Button>
          {onPrimaryAction && (
            <Button variant="contained" disabled={actionBusy || reviewBusy} onClick={() => void runPrimaryAction()}>
              {primaryLabel}
            </Button>
          )}
          {(reviewBusy || actionBusy) && <CircularProgress size={20} />}
        </Stack>

        {reviewError && <Alert severity="error">{reviewError}</Alert>}
        {actionError && <Alert severity="error">{actionError}</Alert>}
        {actionNotice && <Alert severity="success">{actionNotice}</Alert>}
      </Stack>

      {review && <RequirementsReviewView review={review} />}
    </Box>
  );
}
