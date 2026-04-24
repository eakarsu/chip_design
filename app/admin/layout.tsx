'use client';

import { useState } from 'react';
import {
  Box, Drawer, List, ListItem, ListItemButton, ListItemText, Typography, Toolbar, Divider,
  useMediaQuery, IconButton,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DRAWER_WIDTH = 260;

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: 'dashboard' },
  { label: 'Users', href: '/admin/users', icon: 'group' },
  { label: 'Sessions', href: '/admin/sessions', icon: 'devices' },
  { label: 'Audit Logs', href: '/admin/audit-logs', icon: 'history' },
  { label: 'Password Resets', href: '/admin/password-resets', icon: 'lock_reset' },
  { label: 'Email Verifications', href: '/admin/email-verifications', icon: 'mark_email_read' },
  { label: 'Error Logs', href: '/admin/error-logs', icon: 'bug_report' },
  { label: 'Roles & Permissions', href: '/admin/roles', icon: 'admin_panel_settings' },
  { label: 'Security', href: '/admin/security', icon: 'security' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const pathname = usePathname();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  const drawer = (
    <Box>
      <Toolbar sx={{ px: 2 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: theme.palette.primary.main, marginRight: 8 }}>
          admin_panel_settings
        </span>
        <Typography variant="h6" fontWeight={700} noWrap>
          Admin Panel
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ px: 1, pt: 1 }}>
        {navItems.map((item) => (
          <ListItem key={item.href} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              component={Link}
              href={item.href}
              selected={isActive(item.href)}
              onClick={() => isMobile && setMobileOpen(false)}
              sx={{
                borderRadius: 2,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': { bgcolor: 'primary.dark' },
                  '& .material-symbols-outlined': { color: 'inherit' },
                },
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22, marginRight: 12 }}>
                {item.icon}
              </span>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: isActive(item.href) ? 600 : 400 }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 72px)' }}>
      {isMobile && (
        <IconButton
          onClick={() => setMobileOpen(!mobileOpen)}
          sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1200, bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' }, boxShadow: 3 }}
        >
          <span className="material-symbols-outlined">menu</span>
        </IconButton>
      )}
      <Box component="nav" sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: 0 }}>
        {isMobile ? (
          <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}>
            {drawer}
          </Drawer>
        ) : (
          <Drawer variant="permanent" sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, position: 'relative', minHeight: '100%', borderRight: 1, borderColor: 'divider' } }}>
            {drawer}
          </Drawer>
        )}
      </Box>
      <Box component="main" sx={{ flexGrow: 1, p: 3, width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` } }}>
        {children}
      </Box>
    </Box>
  );
}
