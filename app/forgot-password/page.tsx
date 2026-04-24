'use client';

import { useState } from 'react';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert, Link as MuiLink, Container,
} from '@mui/material';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    setSent(true);
    setLoading(false);
  };

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Card>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#4F46E5' }}>
              lock_reset
            </span>
            <Typography variant="h4" fontWeight={700} sx={{ mt: 1 }}>
              Reset Password
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Enter your email to receive a reset link
            </Typography>
          </Box>

          {sent ? (
            <Alert severity="success" sx={{ mb: 3 }}>
              If an account exists with that email, a reset link has been sent.
            </Alert>
          ) : (
            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                sx={{ mb: 3 }}
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                sx={{ mb: 2 }}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </Box>
          )}
          <Box sx={{ textAlign: 'center' }}>
            <MuiLink component={Link} href="/login" variant="body2">
              Back to sign in
            </MuiLink>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}
