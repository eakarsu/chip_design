'use client';

/**
 * Global keyboard shortcuts + help dialog.
 *
 *   /       focus the search trigger (dispatches a `search:open` custom event
 *           that SideNav's SearchDialog listens for)
 *   ?       open this shortcuts help dialog
 *   g d     go to dashboard
 *   g a     go to algorithms
 *   g c     go to compare
 *   g f     go to flow
 *   g h     go to history
 *
 * Two-key sequences time out after 1s of inactivity. Shortcuts are ignored
 * while the user is typing in an input/textarea/contenteditable element.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Table, TableBody, TableCell, TableHead, TableRow, Box, Typography,
} from '@mui/material';

const ROUTES_G: Record<string, string> = {
  d: '/dashboard',
  a: '/algorithms',
  c: '/compare',
  f: '/flow',
  h: '/history',
  s: '/sweep',
  t: '/timing',
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export default function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let pendingG: number | null = null;

    const clearPending = () => {
      if (pendingG !== null) {
        window.clearTimeout(pendingG);
        pendingG = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K is a command-palette convention; allow it even from
      // inside input fields so power users don't have to click away first.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('search:open'));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // Two-key `g X` navigation.
      if (pendingG !== null) {
        const route = ROUTES_G[e.key.toLowerCase()];
        clearPending();
        if (route) {
          e.preventDefault();
          router.push(route);
        }
        return;
      }

      if (e.key === 'g') {
        pendingG = window.setTimeout(clearPending, 1000);
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('search:open'));
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearPending();
    };
  }, [router]);

  return (
    <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogContent dividers>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><strong>Key</strong></TableCell>
              <TableCell><strong>Action</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <Row k="/" label="Focus search" />
            <Row k="⌘K / Ctrl K" label="Open command palette" />
            <Row k="?" label="Show this help" />
            <Row k="g d" label="Go to Dashboard" />
            <Row k="g a" label="Go to Algorithms" />
            <Row k="g c" label="Go to Compare" />
            <Row k="g f" label="Go to Flow" />
            <Row k="g h" label="Go to History" />
            <Row k="g s" label="Go to Sweep" />
            <Row k="g t" label="Go to Timing" />
          </TableBody>
        </Table>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Shortcuts are disabled while typing into a form field.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setHelpOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function Row({ k, label }: { k: string; label: string }) {
  return (
    <TableRow>
      <TableCell sx={{ width: 80 }}>
        <Box
          component="kbd"
          sx={{
            display: 'inline-block', px: 0.75, py: 0.25,
            border: 1, borderColor: 'divider', borderRadius: 0.5,
            fontFamily: 'monospace', fontSize: 12, bgcolor: 'background.default',
          }}
        >
          {k}
        </Box>
      </TableCell>
      <TableCell>{label}</TableCell>
    </TableRow>
  );
}
