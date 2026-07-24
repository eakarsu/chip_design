'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert, Link as MuiLink, Container,
  CircularProgress,
} from '@mui/material';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/admin';
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    if (result.success) {
      router.push(redirect);
    } else {
      setError(result.error || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Card>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#4F46E5' }}>
              lock
            </span>
            <Typography variant="h4" fontWeight={700} sx={{ mt: 1 }}>
              Sign In
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to access the admin dashboard
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              sx={{ mb: 3 }}
            />
            <button
              type="button"
              onClick={() => { setEmail(process.env.NEXT_PUBLIC_DEMO_EMAIL || ''); setPassword(process.env.NEXT_PUBLIC_DEMO_PASSWORD || ''); }}
              disabled={!process.env.NEXT_PUBLIC_DEMO_EMAIL || !process.env.NEXT_PUBLIC_DEMO_PASSWORD}
              aria-label="Auto Fill Demo Credentials"
              style={{ width: '100%', marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid currentColor', background: 'transparent', cursor: 'pointer' }}
            >
              Auto Fill Demo Credentials
            </button>
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ mb: 2 }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <MuiLink component={Link} href="/forgot-password" variant="body2">
                Forgot password?
              </MuiLink>
              <MuiLink component={Link} href="/register" variant="body2">
                Create account
              </MuiLink>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <Container maxWidth="sm" sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    }>
      <LoginForm />
    </Suspense>
  );
}
