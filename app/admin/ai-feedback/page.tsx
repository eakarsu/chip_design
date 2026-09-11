'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

interface FeedbackSummary {
  total: number;
  up: number;
  down: number;
  byMode: Array<{ mode: string; up: number; down: number }>;
  recent: Array<{
    id: string;
    rating: string;
    mode: string;
    page?: string;
    model?: string;
    createdAt: string;
  }>;
}

export default function AdminAiFeedbackPage() {
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/ai/feedback')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? data.error ?? 'Unable to load feedback');
        setSummary(data as FeedbackSummary);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Unable to load feedback')
      );
  }, []);

  if (error) return <Typography color="error">{error}</Typography>;
  if (!summary) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
        AI Feedback
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Thumbs up/down ratings captured from the Ask NeuralChip chat. Ratings are advisory and never
        approve engineering work.
      </Typography>
      <Stack direction="row" gap={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <Chip label={`Total ${summary.total}`} />
        <Chip color="success" label={`Helpful ${summary.up}`} />
        <Chip color="error" label={`Not helpful ${summary.down}`} />
      </Stack>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Rating</TableCell>
              <TableCell>Mode</TableCell>
              <TableCell>Page</TableCell>
              <TableCell>Model</TableCell>
              <TableCell>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {summary.recent.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Chip
                    size="small"
                    color={row.rating === 'up' ? 'success' : 'error'}
                    label={row.rating === 'up' ? 'Helpful' : 'Not helpful'}
                  />
                </TableCell>
                <TableCell>{row.mode}</TableCell>
                <TableCell>{row.page ?? '—'}</TableCell>
                <TableCell>{row.model ?? '—'}</TableCell>
                <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {!summary.recent.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary">
                    No ratings yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
