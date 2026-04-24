'use client';

/**
 * App-shell layout: permanent SideNav on the left (desktop), temporary
 * Drawer on mobile, content on the right, footer below. The side nav now
 * owns brand + search + theme + user menu (previously in the top AppBar).
 *
 * Client component because SideNav relies on usePathname() / client state.
 */

import { useState } from 'react';
import { Box, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { Menu } from '@mui/icons-material';
import Footer from './Footer';
import SideNav, { SIDENAV_WIDTH } from './SideNav';
import Breadcrumbs from './Breadcrumbs';
import KeyboardShortcuts from './KeyboardShortcuts';
import ToastProvider from './ToastProvider';

export default function LayoutWithSideNav({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ToastProvider>
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <KeyboardShortcuts />
      {/* Skip link for keyboard / screen-reader users — previously owned by AppBar. */}
      <a
        href="#main-content"
        className="skip-link"
        style={{
          position: 'absolute',
          left: '-9999px',
          zIndex: 999999,
          padding: '1rem',
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          textDecoration: 'none',
          borderRadius: 4,
        }}
      >
        Skip to main content
      </a>

      <Box sx={{ display: 'flex', flex: 1 }}>
        {/* Desktop: permanent drawer. Mobile: temporary drawer behind a button. */}
        <SideNav
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          variant={isDesktop ? 'permanent' : 'temporary'}
        />

        <Box
          sx={{
            flexGrow: 1,
            minWidth: 0, // allow children with overflow to shrink properly
            ml: { xs: 0, md: `${SIDENAV_WIDTH}px` },
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Mobile-only hamburger — the only top-of-page chrome now that the
              AppBar is gone. Sticky so it remains reachable while scrolling. */}
          {!isDesktop && (
            <Box sx={{ position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
              <IconButton aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
                <Menu />
              </IconButton>
            </Box>
          )}
          <Breadcrumbs />
          <Box component="main" id="main-content" sx={{ flexGrow: 1, minWidth: 0 }}>
            {children}
          </Box>
          {/* Footer lives inside the offset column so it doesn't slide
              under the permanent side drawer and clip the brand text. */}
          <Footer />
        </Box>
      </Box>
    </Box>
    </ToastProvider>
  );
}
