'use client';

import { Box, Typography, Button } from '@mui/material';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'Inter, sans-serif',
          padding: 24,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 80, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
            Critical Error
          </h1>
          <p style={{ color: '#6B7280', marginBottom: 24, maxWidth: 400 }}>
            {error.message || 'A critical error occurred. Please try refreshing the page.'}
          </p>
          <button
            onClick={reset}
            style={{
              padding: '12px 32px',
              backgroundColor: '#4F46E5',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
