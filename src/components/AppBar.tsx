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
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';
import { useState } from 'react';
import ThemeSwitcher from './ThemeSwitcher';
import SearchDialog from './SearchDialog';

const navItems = [
  { label: 'Home', href: '/' },
  { label: 'Products', href: '/products' },
  { label: 'Algorithms', href: '/algorithms' },
  { label: 'Visualizations', href: '/visualizations' },
  { label: 'Compare', href: '/compare' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Architectures', href: '/architectures' },
  { label: 'Benchmarks', href: '/benchmarks' },
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
  { label: 'Careers', href: '/careers' },
  { label: 'Contact', href: '/contact' },
];

export default function AppBar() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
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
                '&:hover': {
                  backgroundColor: theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.04)' : 'rgba(129, 140, 248, 0.08)',
                },
              }}
            >
              <ListItemText primary={item.label} />
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
                    sx={{
                      color: 'text.primary',
                      px: 2,
                      fontWeight: 500,
                      '&:hover': {
                        backgroundColor: theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.04)' : 'rgba(129, 140, 248, 0.08)',
                      },
                    }}
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
