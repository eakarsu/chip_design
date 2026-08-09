'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert, Link as MuiLink, Container,
  CircularProgress,
} from '@mui/material';
import Link from 'next/link';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(searchParams.get('error') || '');
  const [loading, setLoading] = useState(false);
  const [demoCredentials, setDemoCredentials] = useState<{ email: string; password: string } | null>(null);
  const [demoCredentialsLoading, setDemoCredentialsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void fetch('/api/auth/demo-credentials', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json() as { email?: string; password?: string };
        return data.email && data.password
          ? { email: data.email, password: data.password }
          : null;
      })
      .then((credentials) => {
        if (active) setDemoCredentials(credentials);
      })
      .catch(() => {
        if (active) setDemoCredentials(null);
      })
      .finally(() => {
        if (active) setDemoCredentialsLoading(false);
      });

    return () => { active = false; };
  }, []);

  const loginAction = `/api/auth/login?redirect=${encodeURIComponent(redirect)}`;

  const handleDemoLogin = () => {
    if (!demoCredentials) return;

    setEmail(demoCredentials.email);
    setPassword(demoCredentials.password);
    setError('');
    setLoading(true);

    // Submit credentials as a top-level browser navigation. This lets the
    // server set the session cookie and redirect atomically, avoiding a race
    // between a fetch response and the first protected page request.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = loginAction;
    for (const [name, value] of Object.entries(demoCredentials)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
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

          <Box
            component="form"
            action={loginAction}
            method="post"
            onSubmit={() => {
              setError('');
              setLoading(true);
            }}
          >
            <TextField
              fullWidth
              label="Email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              sx={{ mb: 3 }}
            />
            <Button
              type="button"
              variant="outlined"
              fullWidth
              onClick={handleDemoLogin}
              disabled={demoCredentialsLoading || !demoCredentials || loading}
              aria-label="Auto Fill Demo Credentials"
              sx={{ mb: 1.5 }}
            >
              {demoCredentialsLoading
                ? 'Loading Demo Credentials…'
                : loading
                  ? 'Signing In…'
                  : 'Auto Fill & Sign In Demo Account'}
            </Button>
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
