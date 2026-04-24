'use client';

import {
  AppBar as MuiAppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  useMediaQuery,
  InputBase,
  alpha,
  Menu,
  MenuItem,
  Avatar,
  Divider,
  ListItemIcon,
  Chip,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ThemeSwitcher from './ThemeSwitcher';
import SearchDialog from './SearchDialog';
import { useAuth } from '@/lib/auth/context';

const navItems = [
  { label: 'Home', href: '/' },
  { label: 'AI Features', href: '/ai-features', highlight: true },
  { label: 'Products', href: '/products' },
  { label: 'Algorithms', href: '/algorithms' },
  { label: 'Flow', href: '/flow' },
  { label: 'Stream', href: '/stream' },
  { label: 'History', href: '/history' },
  { label: 'Auto-Tune', href: '/autotune' },
  { label: 'Import', href: '/import' },
  { label: 'Sweep', href: '/sweep' },
  { label: 'Congestion', href: '/congestion' },
  { label: 'Library', href: '/library' },
  { label: 'IR-Drop', href: '/ir-drop' },
  { label: 'Pin Assign', href: '/pin-assignment' },
  { label: 'Timing', href: '/timing' },
  { label: 'Visualizations', href: '/visualizations' },
  { label: 'Compare', href: '/compare' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Architectures', href: '/architectures' },
  { label: 'Benchmarks', href: '/benchmarks' },
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
  { label: 'Careers', href: '/careers' },
  { label: 'Contact', href: '/contact' },
  { label: 'Admin', href: '/admin', highlight: false },
];

export default function AppBar() {
  const theme = useTheme();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleUserMenuClose();
    await logout();
    router.push('/');
  };

  const drawer = (
    <Box onClick={handleDrawerToggle} sx={{ textAlign: 'center', pt: 2 }}>
      <Typography variant="h6" sx={{ my: 2, fontWeight: 700 }}>
        NeuralChip
      </Typography>
      <List>
        {navItems.map((item) => (
          <ListItem key={item.label} disablePadding>
            <ListItemButton
              component={Link}
              href={item.href}
              sx={{
                textAlign: 'center',
                backgroundColor: item.highlight ? 'primary.main' : 'transparent',
                color: item.highlight ? 'primary.contrastText' : 'inherit',
                my: item.highlight ? 0.5 : 0,
                mx: item.highlight ? 1 : 0,
                borderRadius: item.highlight ? 1 : 0,
                '&:hover': {
                  backgroundColor: item.highlight
                    ? 'primary.dark'
                    : theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.04)' : 'rgba(129, 140, 248, 0.08)',
                },
              }}
            >
              <ListItemText
                primary={item.highlight ? `✨ ${item.label}` : item.label}
                primaryTypographyProps={{ fontWeight: item.highlight ? 700 : 400 }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <>
      <a href="#main-content" className="skip-link" style={{
        position: 'absolute',
        left: '-9999px',
        zIndex: 999999,
        padding: '1rem',
        backgroundColor: theme.palette.primary.main,
        color: theme.palette.primary.contrastText,
        textDecoration: 'none',
        borderRadius: '4px',
      }}>
        Skip to main content
      </a>
      <MuiAppBar position="sticky" elevation={0}>
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 72 } }}>
            {/* Logo */}
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, marginRight: 8, color: theme.palette.primary.main }}>
                memory
              </span>
              <Typography
                variant="h6"
                component="div"
                sx={{
                  fontWeight: 700,
                  color: 'text.primary',
                  display: { xs: 'none', sm: 'block' },
                  mr: 4,
                }}
              >
                NeuralChip
              </Typography>
            </Link>

            {/* Desktop Navigation */}
            {!isMobile && (
              <Box sx={{ flexGrow: 1, display: 'flex', gap: 0.5 }}>
                {navItems.map((item) => (
                  <Button
                    key={item.label}
                    component={Link}
                    href={item.href}
                    variant={item.highlight ? 'contained' : 'text'}
                    sx={{
                      color: item.highlight ? 'primary.contrastText' : 'text.primary',
                      px: 2,
                      fontWeight: item.highlight ? 700 : 500,
                      backgroundColor: item.highlight ? 'primary.main' : 'transparent',
                      '&:hover': {
                        backgroundColor: item.highlight
                          ? 'primary.dark'
                          : theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.04)' : 'rgba(129, 140, 248, 0.08)',
                      },
                    }}
                    startIcon={item.highlight ? <span className="material-symbols-outlined" style={{ fontSize: 20 }}>auto_awesome</span> : undefined}
                  >
                    {item.label}
                  </Button>
                ))}
              </Box>
            )}

            <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' } }} />

            {/* Search */}
            <IconButton
              onClick={() => setSearchDialogOpen(true)}
              aria-label="search"
              sx={{
                color: 'text.primary',
                mr: 1,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
                search
              </span>
            </IconButton>

            {/* Theme Switcher */}
            <ThemeSwitcher />

            {/* User Auth Menu */}
            {!isLoading && (
              isAuthenticated && user ? (
                <>
                  <IconButton
                    onClick={handleUserMenuOpen}
                    size="small"
                    sx={{ ml: 1 }}
                    aria-label="account menu"
                  >
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: 'primary.main',
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {user.name?.charAt(0).toUpperCase() || 'U'}
                    </Avatar>
                  </IconButton>
                  <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleUserMenuClose}
                    transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                    anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                    slotProps={{
                      paper: {
                        sx: { width: 220, mt: 1 },
                      },
                    }}
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
                      onClick={() => { handleUserMenuClose(); router.push('/profile'); }}
                    >
                      <ListItemIcon>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person</span>
                      </ListItemIcon>
                      Profile
                    </MenuItem>
                    {user.role === 'admin' && (
                      <MenuItem
                        onClick={() => { handleUserMenuClose(); router.push('/admin'); }}
                      >
                        <ListItemIcon>
                          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>admin_panel_settings</span>
                        </ListItemIcon>
                        Admin Dashboard
                      </MenuItem>
                    )}
                    <Divider />
                    <MenuItem onClick={handleLogout}>
                      <ListItemIcon>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
                      </ListItemIcon>
                      Logout
                    </MenuItem>
                  </Menu>
                </>
              ) : (
                <Button
                  component={Link}
                  href="/login"
                  variant="outlined"
                  size="small"
                  sx={{ ml: 1, display: { xs: 'none', sm: 'flex' } }}
                >
                  Login
                </Button>
              )
            )}

            {/* Mobile menu button */}
            {isMobile && (
              <IconButton
                color="inherit"
                aria-label="open drawer"
                edge="end"
                onClick={handleDrawerToggle}
                sx={{ ml: 1, color: 'text.primary' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
                  menu
                </span>
              </IconButton>
            )}
          </Toolbar>
        </Container>
      </MuiAppBar>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        anchor="right"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true,
        }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 240 },
        }}
      >
        {drawer}
      </Drawer>

      {/* Search Dialog */}
      <SearchDialog
        open={searchDialogOpen}
        onClose={() => setSearchDialogOpen(false)}
      />
    </>
  );
}
