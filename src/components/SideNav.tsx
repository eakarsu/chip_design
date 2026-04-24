'use client';

/**
 * Persistent left-hand navigation drawer.
 *
 * Grouped by functional area so the old flat list of ~20 top-bar links is
 * replaced by a scannable hierarchy. On screens below `md` the drawer is
 * collapsible via the `open` prop; on larger screens the caller wires it as
 * permanent.
 */

import {
  Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Typography, Divider, Box, IconButton, Tooltip, Avatar, Menu, MenuItem,
  Button, Chip,
} from '@mui/material';
import {
  Dashboard, AccountTree, Memory, Compare, AutoGraph, FlashOn, Timeline,
  ImportExport, GridOn, Speed, Settings, MenuBook, ViewInAr, Insights,
  History, Gavel, Architecture, AdminPanelSettings, Search as SearchIcon,
  Logout, Person, Build,
} from '@mui/icons-material';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import ThemeSwitcher from './ThemeSwitcher';
import SearchDialog from './SearchDialog';
import { useAuth } from '@/lib/auth/context';

export const SIDENAV_WIDTH = 240;

interface Item { label: string; href: string; icon: ReactNode }
interface Group { title: string; items: Item[] }

const GROUPS: Group[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <Dashboard /> },
    ],
  },
  {
    title: 'Design Flow',
    items: [
      { label: 'Full Flow',   href: '/flow',       icon: <AccountTree /> },
      { label: 'OpenLane',    href: '/openlane',   icon: <Build /> },
      { label: 'Algorithms',  href: '/algorithms', icon: <Memory /> },
      { label: 'Compare',     href: '/compare',    icon: <Compare /> },
      { label: 'Sweep',       href: '/sweep',      icon: <AutoGraph /> },
      { label: 'Auto-Tune',   href: '/autotune',   icon: <FlashOn /> },
      { label: 'Stream',      href: '/stream',     icon: <Timeline /> },
      { label: 'Import',      href: '/import',     icon: <ImportExport /> },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { label: 'Congestion',  href: '/congestion',     icon: <GridOn /> },
      { label: 'IR Drop',     href: '/ir-drop',        icon: <FlashOn /> },
      { label: 'Timing',      href: '/timing',         icon: <Speed /> },
      { label: 'Pin Assign',  href: '/pin-assignment', icon: <Settings /> },
      { label: 'Library',     href: '/library',        icon: <MenuBook /> },
    ],
  },
  {
    title: 'Reports',
    items: [
      { label: 'Visualizations', href: '/visualizations', icon: <ViewInAr /> },
      { label: 'Analytics',      href: '/analytics',      icon: <Insights /> },
      { label: 'History',        href: '/history',        icon: <History /> },
      { label: 'Benchmarks',     href: '/benchmarks',     icon: <Gavel /> },
      { label: 'Architectures',  href: '/architectures',  icon: <Architecture /> },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Admin', href: '/admin', icon: <AdminPanelSettings /> },
    ],
  },
];

interface SideNavProps {
  open: boolean;
  onClose: () => void;
  variant?: 'permanent' | 'temporary';
}

export default function SideNav({ open, onClose, variant = 'permanent' }: SideNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [userAnchor, setUserAnchor] = useState<null | HTMLElement>(null);

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname?.startsWith(href);

  const handleLogout = async () => {
    setUserAnchor(null);
    await logout();
    router.push('/');
  };

  // Global `/` keyboard shortcut dispatches a `search:open` event —
  // listen for it here so the existing SearchDialog host can open.
  useEffect(() => {
    const openSearch = () => setSearchOpen(true);
    window.addEventListener('search:open', openSearch);
    return () => window.removeEventListener('search:open', openSearch);
  }, []);

  // Header block: brand + controls that used to live in the top AppBar
  // (search, theme toggle, user menu / login). Keeps everything compact so
  // it fits inside the 240px drawer without clipping the wordmark.
  const header = (
    <Box sx={{ px: 1.5, pt: 2, pb: 1, overflow: 'visible' }}>
      <Box
        component={Link}
        href="/"
        onClick={variant === 'temporary' ? onClose : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          textDecoration: 'none',
          color: 'inherit',
          mb: 1.5,
          overflow: 'visible',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 22, marginRight: 6, flexShrink: 0, color: 'var(--mui-palette-primary-main, #4f46e5)' }}
        >
          memory
        </span>
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            letterSpacing: '-0.01em',
            fontSize: '1.05rem',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'visible',
            // Explicit padding-right of 1px so the "p" glyph's
            // right-side bearing isn't clipped by a flex ancestor.
            pr: '2px',
          }}
        >
          NeuralChip
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="Search">
          <IconButton size="small" onClick={() => setSearchOpen(true)} aria-label="search">
            <SearchIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <ThemeSwitcher />
        {!isLoading && (
          isAuthenticated && user ? (
            <>
              <IconButton
                size="small"
                onClick={(e) => setUserAnchor(e.currentTarget)}
                aria-label="account menu"
                sx={{ ml: 'auto' }}
              >
                <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: 13, fontWeight: 600 }}>
                  {user.name?.charAt(0).toUpperCase() || 'U'}
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={userAnchor}
                open={Boolean(userAnchor)}
                onClose={() => setUserAnchor(null)}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                slotProps={{ paper: { sx: { width: 220 } } }}
              >
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="subtitle2" noWrap>{user.name}</Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>
                  <Chip
                    label={user.role}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ mt: 0.5, textTransform: 'capitalize' }}
                  />
                </Box>
                <Divider />
                <MenuItem onClick={() => { setUserAnchor(null); router.push('/profile'); }}>
                  <Person fontSize="small" sx={{ mr: 1 }} /> Profile
                </MenuItem>
                {user.role === 'admin' && (
                  <MenuItem onClick={() => { setUserAnchor(null); router.push('/admin'); }}>
                    <AdminPanelSettings fontSize="small" sx={{ mr: 1 }} /> Admin
                  </MenuItem>
                )}
                <Divider />
                <MenuItem onClick={handleLogout}>
                  <Logout fontSize="small" sx={{ mr: 1 }} /> Logout
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Button
              component={Link}
              href="/login"
              size="small"
              variant="outlined"
              sx={{ ml: 'auto' }}
              onClick={variant === 'temporary' ? onClose : undefined}
            >
              Login
            </Button>
          )
        )}
      </Box>
    </Box>
  );

  const content = (
    <Box role="navigation" aria-label="Side navigation" sx={{ overflowY: 'auto', overflowX: 'visible' }}>
      {header}
      <Divider />
      {GROUPS.map((group, idx) => (
        <Box key={group.title}>
          {idx > 0 && <Divider />}
          <Typography
            variant="overline"
            sx={{ display: 'block', px: 2, pt: 2, pb: 0.5, color: 'text.secondary' }}
          >
            {group.title}
          </Typography>
          <List dense>
            {group.items.map(item => (
              <ListItem key={item.href} disablePadding>
                <ListItemButton
                  component={Link}
                  href={item.href}
                  selected={isActive(item.href)}
                  onClick={variant === 'temporary' ? onClose : undefined}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      ))}
    </Box>
  );

  return (
    <>
      <Drawer
        variant={variant}
        open={variant === 'temporary' ? open : true}
        onClose={onClose}
        sx={{
          width: SIDENAV_WIDTH,
          flexShrink: 0,
          display: { xs: variant === 'temporary' ? 'block' : 'none', md: variant === 'permanent' ? 'block' : 'none' },
          '& .MuiDrawer-paper': {
            width: SIDENAV_WIDTH,
            boxSizing: 'border-box',
          },
        }}
        ModalProps={{ keepMounted: true }}
      >
        {content}
      </Drawer>
      {/* Search is rendered here so the trigger in the drawer header can open
          it. Rendered outside the Drawer so its backdrop sits above the nav. */}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
