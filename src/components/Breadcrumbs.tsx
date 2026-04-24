'use client';

/**
 * Path-derived breadcrumbs. Takes the current URL segments and renders a
 * Home → Section → … trail. Hidden on `/`, `/dashboard`, and auth pages
 * (login/register/forgot-password/reset-password) where a breadcrumb is
 * just noise.
 */

import { Breadcrumbs as MuiBreadcrumbs, Link as MuiLink, Typography, Box } from '@mui/material';
import { NavigateNext, Home } from '@mui/icons-material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const HIDE_ON = new Set(['/', '/dashboard', '/login', '/register', '/forgot-password', '/reset-password']);

// Pretty-print a path segment, with overrides for abbreviations and IDs.
function labelFor(segment: string, idx: number, all: string[]): string {
  // Bracketed dynamic route like [id] — show the raw value as "#<val>".
  if (/^[0-9a-f-]{6,}$/i.test(segment)) return `#${segment.slice(0, 8)}`;
  const overrides: Record<string, string> = {
    'ir-drop': 'IR Drop',
    'pin-assignment': 'Pin Assignment',
    'ai-features': 'AI Features',
    'autotune': 'Auto-Tune',
    'drc-lvs': 'DRC/LVS',
  };
  if (overrides[segment]) return overrides[segment];
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function Breadcrumbs() {
  const pathname = usePathname() ?? '/';
  if (HIDE_ON.has(pathname)) return null;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
      <MuiBreadcrumbs
        separator={<NavigateNext fontSize="small" />}
        aria-label="breadcrumb"
      >
        <MuiLink
          component={Link}
          href="/dashboard"
          underline="hover"
          color="inherit"
          sx={{ display: 'flex', alignItems: 'center' }}
        >
          <Home fontSize="small" sx={{ mr: 0.5 }} />
          Home
        </MuiLink>
        {segments.map((seg, i) => {
          const href = '/' + segments.slice(0, i + 1).join('/');
          const isLast = i === segments.length - 1;
          const label = labelFor(seg, i, segments);
          if (isLast) {
            return (
              <Typography key={href} color="text.primary">
                {label}
              </Typography>
            );
          }
          return (
            <MuiLink key={href} component={Link} href={href} underline="hover" color="inherit">
              {label}
            </MuiLink>
          );
        })}
      </MuiBreadcrumbs>
    </Box>
  );
}
