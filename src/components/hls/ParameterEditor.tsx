'use client';

/**
 * Kernel parameter binding editor (name/value rows) shared by the HLS panels.
 *
 * Rows are converted to the `parameters` record the API expects. Values must
 * be integers in the schema's [-1000000, 1000000] range; invalid rows block the
 * request with a readable message instead of being silently dropped.
 */
import {
  Alert,
  Button,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import type { ParameterRow } from './types';

export interface ParameterEditorProps {
  rows: ParameterRow[];
  onChange: (rows: ParameterRow[]) => void;
  disabled?: boolean;
}

export function buildParameterRecord(rows: ParameterRow[]): { record: Record<string, number>; error: string } {
  const record: Record<string, number> = {};
  for (const row of rows) {
    const name = row.name.trim();
    const raw = row.value.trim();
    if (!name && !raw) continue;
    if (!name) return { record: {}, error: 'Every parameter row needs a name.' };
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return { record: {}, error: `Parameter name "${name}" must be a C identifier.` };
    }
    if (Object.prototype.hasOwnProperty.call(record, name)) {
      return { record: {}, error: `Parameter "${name}" is bound twice.` };
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < -1_000_000 || value > 1_000_000) {
      return {
        record: {},
        error: `Parameter "${name}" needs an integer value between -1000000 and 1000000.`,
      };
    }
    record[name] = value;
  }
  return { record, error: '' };
}

export default function ParameterEditor({ rows, onChange, disabled }: ParameterEditorProps) {
  const update = (index: number, patch: Partial<ParameterRow>) => {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  };

  return (
    <Stack gap={1}>
      <Stack direction="row" gap={1} alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2" fontWeight={700}>
          Parameter bindings (optional)
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          disabled={disabled}
          onClick={() => onChange([...rows, { name: '', value: '' }])}
        >
          Add parameter
        </Button>
      </Stack>
      {rows.length === 0 && (
        <Alert severity="info" sx={{ py: 0.25 }}>
          <Typography variant="body2">
            No explicit bindings: signature defaults and <code>#define</code> values are used as written.
          </Typography>
        </Alert>
      )}
      {rows.map((row, index) => (
        <Stack key={index} direction="row" gap={1} alignItems="center">
          <TextField
            size="small"
            label={`name ${index + 1}`}
            value={row.name}
            disabled={disabled}
            onChange={(event) => update(index, { name: event.target.value })}
            sx={{ flex: 2 }}
          />
          <TextField
            size="small"
            label="integer value"
            type="number"
            value={row.value}
            disabled={disabled}
            onChange={(event) => update(index, { value: event.target.value })}
            sx={{ flex: 1 }}
          />
          <Tooltip title="Remove row">
            <IconButton
              size="small"
              aria-label={`Remove parameter row ${index + 1}`}
              disabled={disabled}
              onClick={() => onChange(rows.filter((_, position) => position !== index))}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ))}
    </Stack>
  );
}
