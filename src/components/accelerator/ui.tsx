'use client';

/** Small shared presentational pieces for the accelerator workspaces. */
import { useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { downloadTextFile } from './utils';

export function KeyValueGrid({
  rows,
  size = { xs: 12, sm: 6, md: 3 },
  title,
}: {
  rows: Array<[string, ReactNode]>;
  size?: { xs?: number; sm?: number; md?: number; lg?: number };
  title?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Box>
      {title && (
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
      )}
      <Grid container spacing={1.5} sx={{ mt: title ? 0.5 : 0 }}>
        {rows.map(([label, value]) => (
          <Grid key={label} size={size}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Typography variant="caption" color="text.secondary" component="div">
                  {label}
                </Typography>
                <Typography variant="subtitle1" fontWeight={700} component="div">
                  {value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export function CodeBlock({
  title,
  code,
  filename,
  maxHeight = 460,
}: {
  title: string;
  code: string;
  /** When set, an explicit download button is offered for this filename. */
  filename?: string;
  maxHeight?: number;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" gap={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
        <Stack direction="row" gap={1}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              void navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? 'copied' : 'copy'}
          </Button>
          {filename && (
            <Button size="small" variant="contained" onClick={() => downloadTextFile(filename, code, 'text/plain')}>
              download {filename}
            </Button>
          )}
        </Stack>
      </Stack>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          fontSize: 11.5,
          fontFamily: 'monospace',
          lineHeight: 1.45,
          border: '1px solid #cbd5e1',
          borderRadius: 1,
          overflow: 'auto',
          maxHeight,
          background: '#0f172a',
          color: '#e2e8f0',
        }}
      >
        {code}
      </Box>
    </Paper>
  );
}

export function NotesAlerts({ title, notes }: { title: string; notes: string[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700}>
        {title}
      </Typography>
      <Stack gap={0.5} sx={{ mt: 0.5 }}>
        {notes.map((note, index) => (
          <Alert key={`${index}-${note.slice(0, 24)}`} severity="info" sx={{ py: 0.25 }}>
            <Typography variant="body2">{note}</Typography>
          </Alert>
        ))}
      </Stack>
    </Box>
  );
}

export function ChipList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Stack direction="row" gap={0.5} flexWrap="wrap">
        {items.map((item) => (
          <Chip key={item} size="small" variant="outlined" label={item} />
        ))}
      </Stack>
    </Box>
  );
}

export function EmptyNotice({ children }: { children: ReactNode }) {
  return <Alert severity="info">{children}</Alert>;
}
