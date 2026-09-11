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
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Box,
  IconButton,
  Tooltip,
  Avatar,
  Menu,
  MenuItem,
  Button,
  Chip,
} from '@mui/material';
import {
  Dashboard,
  AccountTree,
  Memory,
  Compare,
  AutoGraph,
  FlashOn,
  Timeline,
  ImportExport,
  GridOn,
  Speed,
  Settings,
  MenuBook,
  ViewInAr,
  Insights,
  History,
  Gavel,
  Architecture,
  AdminPanelSettings,
  Search as SearchIcon,
  Logout,
  Person,
  Build,
  GridView,
  FactCheck,
  BugReport,
  PrecisionManufacturing,
  Hub,
  School,
  Close,
  ExpandLess,
  ExpandMore,
  Star,
  StarBorder,
} from '@mui/icons-material';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import ThemeSwitcher from './ThemeSwitcher';
import SearchDialog from './SearchDialog';
import { useAuth } from '@/lib/auth/context';
import {
  emptyNavPreferences,
  isFavorite,
  isGroupExpanded,
  loadNavPreferences,
  pushRecent,
  saveNavPreferences,
  setGroupCollapsed,
  toggleFavorite,
  type NavPreferences,
} from '@/lib/navigation';

export const SIDENAV_WIDTH = 240;

interface Item {
  label: string;
  href: string;
  icon: ReactNode;
}
interface Group {
  title: string;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <Dashboard /> },
      { label: 'Learn & Engineer', href: '/workspace/projects', icon: <School /> },
      { label: 'Design Workspace', href: '/workspace', icon: <Hub /> },
      { label: 'Governed EDA Runs', href: '/workspace/execution', icon: <PrecisionManufacturing /> },
      { label: 'Engineering Operations', href: '/operations', icon: <FactCheck /> },
      { label: 'AI Design Studio', href: '/capabilities', icon: <AutoGraph /> },
    ],
  },
  {
    title: 'Governed AI',
    items: [
      {
        label: 'Chip Lifecycle',
        href: '/governed-ai/lifecycle',
        icon: <Timeline />,
      },
      { label: 'AI Chat Workspace', href: '/governed-ai/chat', icon: <FactCheck /> },
    ],
  },
  {
    title: 'Design Flow',
    items: [
      { label: 'Full Flow', href: '/flow', icon: <AccountTree /> },
      { label: 'Floorplan', href: '/floorplan', icon: <Architecture /> },
      { label: 'OpenLane', href: '/openlane', icon: <Build /> },
      { label: 'KLayout', href: '/klayout', icon: <GridView /> },
      { label: 'Layout Diff', href: '/layout-diff', icon: <Compare /> },
      { label: 'LVS', href: '/lvs', icon: <FactCheck /> },
      { label: 'DRC Deck', href: '/drc-deck', icon: <Gavel /> },
      { label: 'PDN Gen', href: '/pdn', icon: <FlashOn /> },
      { label: 'GDS Remap', href: '/gds-remap', icon: <Compare /> },
      { label: 'Cell Hier', href: '/cell-hier', icon: <AccountTree /> },
      { label: 'Layer Bool', href: '/layer-bool', icon: <Compare /> },
      { label: 'Density Fill', href: '/density-fill', icon: <GridOn /> },
      { label: 'Tap/Endcap', href: '/tap-endcap', icon: <Architecture /> },
      { label: 'Pin Access', href: '/pin-access', icon: <FactCheck /> },
      { label: 'X-Section', href: '/xsection', icon: <ViewInAr /> },
      { label: 'Bump/RDL', href: '/bump-rdl', icon: <GridOn /> },
      { label: 'Wafer Plan', href: '/wafer', icon: <ViewInAr /> },
      { label: 'Algorithms', href: '/algorithms', icon: <Memory /> },
      { label: 'Synth Graph', href: '/synth-graph', icon: <Memory /> },
      { label: 'Compare', href: '/compare', icon: <Compare /> },
      { label: 'Sweep', href: '/sweep', icon: <AutoGraph /> },
      { label: 'Auto-Tune', href: '/autotune', icon: <FlashOn /> },
      { label: 'Stream', href: '/stream', icon: <Timeline /> },
      { label: 'Import', href: '/import', icon: <ImportExport /> },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { label: 'Congestion', href: '/congestion', icon: <GridOn /> },
      { label: 'Cong. Map', href: '/congestion-map', icon: <GridOn /> },
      { label: 'IR Drop', href: '/ir-drop', icon: <FlashOn /> },
      { label: 'Power', href: '/power', icon: <Insights /> },
      { label: 'Timing', href: '/timing', icon: <Speed /> },
      { label: 'Slack Hist', href: '/slack-histogram', icon: <Speed /> },
      { label: 'Wire Length', href: '/wire-length', icon: <Insights /> },
      { label: 'SDC Editor', href: '/sdc', icon: <MenuBook /> },
      { label: 'Clock Tree', href: '/cts', icon: <AccountTree /> },
      { label: 'Antennas', href: '/antennas', icon: <BugReport /> },
      { label: 'Pin Assign', href: '/pin-assignment', icon: <Settings /> },
      { label: 'Library', href: '/library', icon: <MenuBook /> },
      { label: 'Liberty', href: '/liberty', icon: <MenuBook /> },
    ],
  },
  {
    title: 'DFT & Test',
    items: [
      { label: 'Scan Stitch', href: '/scan-stitch', icon: <AccountTree /> },
      { label: 'ATPG', href: '/atpg', icon: <FactCheck /> },
      { label: 'MBIST', href: '/mbist', icon: <Memory /> },
      { label: 'JTAG', href: '/jtag', icon: <Settings /> },
      { label: 'IDDQ', href: '/iddq', icon: <FlashOn /> },
      { label: 'TDF', href: '/tdf', icon: <Speed /> },
    ],
  },
  {
    title: 'Verification',
    items: [
      { label: 'RTL Lint', href: '/rtl-lint', icon: <Gavel /> },
      { label: 'CDC', href: '/cdc', icon: <Compare /> },
      { label: 'Cov Merge', href: '/cov-merge', icon: <Insights /> },
      { label: 'SVA Density', href: '/sva-density', icon: <GridOn /> },
      { label: 'Stim Gen', href: '/stim-gen', icon: <AutoGraph /> },
      { label: 'Log Triage', href: '/log-triage', icon: <BugReport /> },
    ],
  },
  {
    title: 'Memory',
    items: [
      { label: 'SRAM Planner', href: '/sram-planner', icon: <Memory /> },
      { label: 'CACTI-lite', href: '/cacti-lite', icon: <Memory /> },
      { label: 'ECC/SECDED', href: '/ecc', icon: <FactCheck /> },
      { label: 'BIST Wrap', href: '/bist-wrap', icon: <Memory /> },
      { label: 'DRAM Refresh', href: '/dram-refresh', icon: <Memory /> },
      { label: 'TCAM', href: '/tcam', icon: <GridView /> },
    ],
  },
  {
    title: 'Mixed-Signal',
    items: [
      { label: 'gm/Id Sizing', href: '/gm-id', icon: <AutoGraph /> },
      { label: 'Common Centroid', href: '/common-centroid', icon: <GridOn /> },
      { label: 'PLL Filter', href: '/pll-filter', icon: <Speed /> },
      { label: 'LDO PSRR', href: '/ldo-psrr', icon: <FlashOn /> },
      { label: 'Bandgap', href: '/bandgap', icon: <Insights /> },
      { label: 'SPICE TB', href: '/spice-tb', icon: <MenuBook /> },
    ],
  },
  {
    title: 'Reliability',
    items: [
      { label: 'EM Check', href: '/em-check', icon: <FlashOn /> },
      { label: 'Aging (BTI)', href: '/aging', icon: <Speed /> },
      { label: 'ESD Coverage', href: '/esd-coverage', icon: <FactCheck /> },
      { label: 'Latch-up', href: '/latchup', icon: <BugReport /> },
      { label: 'FIT / MTTF', href: '/fit', icon: <Insights /> },
      { label: 'IR×EM Hotspot', href: '/rel-hotspot', icon: <GridOn /> },
    ],
  },
  {
    title: 'Reports',
    items: [
      { label: 'Visualizations', href: '/visualizations', icon: <ViewInAr /> },
      { label: 'Analytics', href: '/analytics', icon: <Insights /> },
      { label: 'History', href: '/history', icon: <History /> },
      { label: 'Benchmarks', href: '/benchmarks', icon: <Gavel /> },
      { label: 'Architectures', href: '/architectures', icon: <Architecture /> },
    ],
  },
  {
    title: 'Resources',
    items: [
      { label: 'Academy Workspace', href: '/academy', icon: <School /> },
      { label: 'Learning Library', href: '/learn', icon: <MenuBook /> },
      { label: 'Glossary', href: '/glossary', icon: <SearchIcon /> },
      { label: 'Reference Library', href: '/references', icon: <FactCheck /> },
      { label: 'Platform Docs', href: '/docs', icon: <MenuBook /> },
      { label: 'Products', href: '/products', icon: <Memory /> },
      { label: 'Contact', href: '/contact', icon: <Person /> },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Academy Instructor', href: '/academy/instructor', icon: <School /> },
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
  const [currentHash, setCurrentHash] = useState('');
  const [preferences, setPreferences] = useState<NavPreferences>(emptyNavPreferences);
  const preferencesLoaded = useRef(false);

  const isActive = (href: string) => {
    const [hrefPath, hrefHash] = href.split('#');
    if (hrefHash) return pathname === hrefPath && currentHash === `#${hrefHash}`;
    if (href === '/governed-ai/lifecycle') return pathname === href && !currentHash;
    if (href === '/dashboard' || href === '/academy') return pathname === href;
    return pathname?.startsWith(href);
  };

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

  useEffect(() => {
    const updateHash = () => setCurrentHash(window.location.hash);
    updateHash();
    window.addEventListener('hashchange', updateHash);
    return () => window.removeEventListener('hashchange', updateHash);
  }, [pathname]);

  useEffect(() => {
    setPreferences(loadNavPreferences());
    preferencesLoaded.current = true;
  }, []);
  useEffect(() => {
    if (preferencesLoaded.current) saveNavPreferences(preferences);
  }, [preferences]);
  useEffect(() => {
    if (!pathname) return;
    const match = GROUPS.flatMap((group) => group.items).find((item) => item.href.split('#')[0] === pathname);
    setPreferences((current) =>
      pushRecent(current, match ? { href: match.href, label: match.label } : { href: pathname, label: pathname })
    );
  }, [pathname]);

  // Header block: brand + controls that used to live in the top AppBar
  // (search, theme toggle, user menu / login). Keeps everything compact so
  // it fits inside the 240px drawer without clipping the wordmark.
  const header = (
    <Box
      sx={{ px: 1.5, pt: 2, pb: 1, pr: variant === 'temporary' ? 6 : 1.5, overflow: 'visible', position: 'relative' }}
    >
      {variant === 'temporary' && (
        <IconButton
          aria-label="Close navigation menu"
          onClick={onClose}
          sx={{ position: 'absolute', top: 10, right: 8, minWidth: 44, minHeight: 44 }}
        >
          <Close />
        </IconButton>
      )}
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
        {!isLoading &&
          (isAuthenticated && user ? (
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
                  <Typography variant="subtitle2" noWrap>
                    {user.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {user.email}
                  </Typography>
                  <Chip
                    label={user.role}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ mt: 0.5, textTransform: 'capitalize' }}
                  />
                </Box>
                <Divider />
                <MenuItem
                  onClick={() => {
                    setUserAnchor(null);
                    router.push('/profile');
                  }}
                >
                  <Person fontSize="small" sx={{ mr: 1 }} /> Profile
                </MenuItem>
                {user.role === 'admin' && (
                  <MenuItem
                    onClick={() => {
                      setUserAnchor(null);
                      router.push('/admin');
                    }}
                  >
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
          ))}
      </Box>
    </Box>
  );

  const allNavItems = GROUPS.flatMap((group) => group.items);
  const favoriteItems = allNavItems.filter((item) => isFavorite(preferences, item.href));
  const recentItems: Item[] = preferences.recent.map((recent) => ({ ...recent, icon: <History /> }));
  const groupHasActive = (items: Item[]) => items.some((item) => isActive(item.href));

  const toggleCollapsed = (title: string, items: Item[], alwaysOpen = false) => {
    setPreferences((current) =>
      setGroupCollapsed(current, title, isGroupExpanded(current, title, groupHasActive(items), { alwaysOpen }))
    );
  };

  const renderNavItem = (item: Item, key: string, removable = false) => (
    <ListItem
      key={key}
      disablePadding
      secondaryAction={
        <IconButton
          size="small"
          aria-label={
            removable
              ? `Unpin ${item.label}`
              : isFavorite(preferences, item.href)
                ? `Remove ${item.label} from favorites`
                : `Add ${item.label} to favorites`
          }
          onClick={() => setPreferences((current) => toggleFavorite(current, { href: item.href, label: item.label }))}
        >
          {removable || isFavorite(preferences, item.href) ? (
            <Star fontSize="small" color="primary" />
          ) : (
            <StarBorder fontSize="small" />
          )}
        </IconButton>
      }
    >
      <ListItemButton
        component={Link}
        href={item.href}
        selected={isActive(item.href)}
        onClick={variant === 'temporary' ? onClose : undefined}
        sx={{ pr: 6 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
        <ListItemText primary={item.label} />
      </ListItemButton>
    </ListItem>
  );

  const renderGroup = (
    title: string,
    items: Item[],
    options: { alwaysOpen?: boolean; keyPrefix?: string; removable?: boolean } = {}
  ) => {
    const expanded = isGroupExpanded(preferences, title, groupHasActive(items), {
      alwaysOpen: options.alwaysOpen,
    });
    return (
      <Box key={title}>
        <ListItemButton
          onClick={() => toggleCollapsed(title, items, options.alwaysOpen)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title} section`}
          sx={{ px: 2, pt: 1.5, pb: 0.5 }}
        >
          <Typography variant="overline" sx={{ flex: 1, color: 'text.secondary', lineHeight: 1.6 }}>
            {title}
          </Typography>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </ListItemButton>
        {expanded && (
          <List dense>
            {items.map((item) => renderNavItem(item, `${options.keyPrefix ?? title}:${item.href}`, options.removable))}
          </List>
        )}
      </Box>
    );
  };

  const content = (
    <Box
      id={variant === 'temporary' ? 'mobile-side-navigation' : undefined}
      role="navigation"
      aria-label="Side navigation"
      sx={{ height: '100%', overflowY: 'auto', overflowX: 'visible', overscrollBehavior: 'contain' }}
    >
      {header}
      <Divider />
      {(() => {
        const sections: ReactNode[] = [];
        let firstSection = true;
        const add = (
          title: string,
          items: Item[],
          options: { alwaysOpen?: boolean; keyPrefix?: string; removable?: boolean } = {}
        ) => {
          if (!items.length) return;
          if (!firstSection) sections.push(<Divider key={`divider-${title}`} />);
          firstSection = false;
          sections.push(renderGroup(title, items, options));
        };
        add('Favorites', favoriteItems, { alwaysOpen: true, keyPrefix: 'favorites', removable: true });
        add('Recent', recentItems, { alwaysOpen: true, keyPrefix: 'recent' });
        for (const group of GROUPS.filter((entry) => entry.title !== 'Admin' || user?.role === 'admin')) {
          add(group.title, group.items);
        }
        return sections;
      })()}
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
            width: variant === 'temporary' ? { xs: 'min(88vw, 320px)', sm: SIDENAV_WIDTH } : SIDENAV_WIDTH,
            maxWidth: '100vw',
            height: '100dvh',
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
