'use client';

import { Box, Typography, Button, Container } from '@mui/material';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 80, color: '#DC2626', marginBottom: 16 }}>
        error
      </span>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Something went wrong
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        {error.message || 'An unexpected error occurred'}
      </Typography>
      <Button variant="contained" onClick={reset} size="large">
        Try Again
      </Button>
    </Container>
  );
}
