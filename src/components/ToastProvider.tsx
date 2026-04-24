'use client';

/**
 * Minimal toast/snackbar system. Wrap the tree once; any descendant calls
 * `useToast()` and fires `toast.success('Saved')`, `toast.error('...')`, etc.
 *
 * Shows one toast at a time; newer toasts replace older ones. Auto-dismiss
 * after `duration` ms (default 4000), or user can click the X.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Alert, Snackbar } from '@mui/material';

type Severity = 'success' | 'info' | 'warning' | 'error';

interface ToastState {
  message: string;
  severity: Severity;
  key: number;
}

interface ToastAPI {
  success: (msg: string, duration?: number) => void;
  info:    (msg: string, duration?: number) => void;
  warning: (msg: string, duration?: number) => void;
  error:   (msg: string, duration?: number) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [duration, setDuration] = useState(4000);

  const show = useCallback((severity: Severity) => (message: string, d = 4000) => {
    setDuration(d);
    // `key` forces Snackbar to re-open even when the previous message
    // hadn't finished animating out yet.
    setToast({ message, severity, key: Date.now() });
  }, []);

  const api: ToastAPI = {
    success: show('success'),
    info:    show('info'),
    warning: show('warning'),
    error:   show('error'),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        key={toast?.key ?? 'none'}
        open={toast !== null}
        autoHideDuration={duration}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          setToast(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            variant="filled"
            onClose={() => setToast(null)}
            sx={{ minWidth: 280 }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}
