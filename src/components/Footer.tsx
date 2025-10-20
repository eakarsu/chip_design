'use client';

import { Box, Container, Grid, Typography, Link as MuiLink, IconButton, Divider } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';

const footerSections = [
  {
    title: 'Products',
    links: [
      { label: 'AI Accelerators', href: '/products#accelerators' },
      { label: 'Neural Processors', href: '/products#processors' },
      { label: 'Edge Devices', href: '/products#edge' },
      { label: 'Cloud Solutions', href: '/products#cloud' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'API Reference', href: '/docs/api' },
      { label: 'SDKs & Tools', href: '/docs/sdks' },
      { label: 'GitHub', href: 'https://github.com' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/about' },
      { label: 'Careers', href: '/careers' },
      { label: 'Blog', href: '/blog' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Cookie Policy', href: '/cookies' },
      { label: 'Licenses', href: '/licenses' },
    ],
  },
];

const socialLinks = [
  { name: 'GitHub', icon: 'code', href: 'https://github.com' },
  { name: 'Twitter', icon: 'tag', href: 'https://twitter.com' },
  { name: 'LinkedIn', icon: 'work', href: 'https://linkedin.com' },
  { name: 'YouTube', icon: 'play_circle', href: 'https://youtube.com' },
];

export default function Footer() {
  const theme = useTheme();
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'background.paper',
        borderTop: `1px solid ${theme.palette.divider}`,
        py: { xs: 6, md: 8 },
        mt: 'auto',
      }}
    >
      <Container maxWidth="xl">
        <Grid container spacing={4}>
          {/* Brand Column */}
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, marginRight: 8, color: theme.palette.primary.main }}>
                memory
              </span>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                NeuralChip
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 300 }}>
              Pioneering the next generation of AI chip architecture. Accelerating intelligence from edge to cloud.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {socialLinks.map((social) => (
                <IconButton
                  key={social.name}
                  component="a"
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.name}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': {
                      color: 'primary.main',
                      backgroundColor: theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.04)' : 'rgba(129, 140, 248, 0.08)',
                    },
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    {social.icon}
                  </span>
                </IconButton>
              ))}
            </Box>
          </Grid>

          {/* Links Columns */}
          {footerSections.map((section) => (
            <Grid item xs={6} sm={3} md={2} key={section.title}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                {section.title}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {section.links.map((link) => (
                  <Box component="li" key={link.label} sx={{ mb: 1 }}>
                    <MuiLink
                      component={link.href.startsWith('http') ? 'a' : Link}
                      href={link.href}
                      target={link.href.startsWith('http') ? '_blank' : undefined}
                      rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      color="text.secondary"
                      sx={{
                        fontSize: '0.875rem',
                        '&:hover': {
                          color: 'primary.main',
                        },
                      }}
                    >
                      {link.label}
                    </MuiLink>
                  </Box>
                ))}
              </Box>
            </Grid>
          ))}
        </Grid>

        <Divider sx={{ my: 4 }} />

        {/* Bottom Bar */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            &copy; {currentYear} NeuralChip, Inc. All rights reserved.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Built with Next.js, MUI, and Material Design 3
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
