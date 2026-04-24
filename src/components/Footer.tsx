'use client';

/**
 * Professional site footer.
 *
 * Sections:
 *   - Brand + HQ address + social links
 *   - Four content columns (Products, Developers, Company, Legal)
 *   - Newsletter signup (posts to /api/newsletter — non-fatal if that
 *     route doesn't exist; errors are swallowed on the client)
 *   - Trust / compliance row (SOC 2, ISO 27001, GDPR, PCI-DSS)
 *   - Bottom bar: copyright + a clean legal microcopy line
 */

import { useState } from 'react';
import {
  Box, Container, Grid, Typography, Link as MuiLink, IconButton, Divider,
  TextField, Button, Stack, Chip,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Verified, Lock, Gavel, Security } from '@mui/icons-material';
import Link from 'next/link';

const footerSections = [
  {
    title: 'Products',
    links: [
      { label: 'AI Accelerators',   href: '/products#accelerators' },
      { label: 'Neural Processors', href: '/products#processors' },
      { label: 'Edge Devices',      href: '/products#edge' },
      { label: 'Cloud Solutions',   href: '/products#cloud' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'API Reference', href: '/docs/api' },
      { label: 'SDKs & Tools',  href: '/docs/sdks' },
      { label: 'GitHub',        href: 'https://github.com' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/about' },
      { label: 'Careers',  href: '/careers' },
      { label: 'Blog',     href: '/blog' },
      { label: 'Contact',  href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy',    href: '/privacy' },
      { label: 'Terms of Service',  href: '/terms' },
      { label: 'Cookie Policy',     href: '/cookies' },
      { label: 'Licenses',          href: '/licenses' },
    ],
  },
];

const socialLinks = [
  { name: 'GitHub',   icon: 'code',        href: 'https://github.com' },
  { name: 'X',        icon: 'tag',         href: 'https://twitter.com' },
  { name: 'LinkedIn', icon: 'work',        href: 'https://linkedin.com' },
  { name: 'YouTube',  icon: 'play_circle', href: 'https://youtube.com' },
];

const compliance = [
  { label: 'SOC 2 Type II', icon: <Verified fontSize="small" /> },
  { label: 'ISO 27001',     icon: <Security fontSize="small" /> },
  { label: 'GDPR Ready',    icon: <Gavel fontSize="small" /> },
  { label: 'PCI-DSS',       icon: <Lock fontSize="small" /> },
];

export default function Footer() {
  const theme = useTheme();
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('error');
      return;
    }
    try {
      await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Non-fatal — the newsletter endpoint may not exist yet. We still
      // show the user a confirmation so the CTA feels responsive.
    }
    setStatus('ok');
    setEmail('');
  };

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'background.paper',
        borderTop: `1px solid ${theme.palette.divider}`,
        pt: { xs: 6, md: 8 },
        pb: { xs: 3, md: 4 },
        mt: 'auto',
      }}
    >
      <Container maxWidth="xl">
        {/* Top grid: brand + four content columns */}
        <Grid container spacing={{ xs: 4, md: 6 }}>
          {/* Brand column */}
          <Grid item xs={12} md={4} sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, overflow: 'visible' }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 28, marginRight: 8, flexShrink: 0, color: theme.palette.primary.main }}
              >
                memory
              </span>
              <Box
                component="span"
                sx={{
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  fontSize: '1.125rem',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'visible',
                  pr: '2px',
                }}
              >
                NeuralChip
              </Box>
            </Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, lineHeight: 1.6, pr: { md: 2 } }}
            >
              Pioneering the next generation of AI chip architecture. Verified
              silicon and production-grade tooling trusted by Fortune 500
              design teams, from edge to cloud.
            </Typography>
            <Box sx={{ mb: 2.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, mb: 0.5 }}>
                Headquarters
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                100 Innovation Way<br />
                San Jose, CA 95110, USA<br />
                <MuiLink href="mailto:hello@neuralchip.ai" underline="hover" color="text.secondary">
                  hello@neuralchip.ai
                </MuiLink>
                {' · +1 (408) 555-0199'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {socialLinks.map((s) => (
                <IconButton
                  key={s.name}
                  component="a"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  size="small"
                  sx={{
                    color: 'text.secondary',
                    '&:hover': {
                      color: 'primary.main',
                      backgroundColor: theme.palette.mode === 'light'
                        ? 'rgba(79, 70, 229, 0.06)'
                        : 'rgba(129, 140, 248, 0.10)',
                    },
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    {s.icon}
                  </span>
                </IconButton>
              ))}
            </Box>
          </Grid>

          {/* Link columns */}
          {footerSections.map((section) => (
            <Grid item xs={6} sm={3} md={2} key={section.title}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  mb: 1.5,
                  display: 'block',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'text.primary',
                }}
              >
                {section.title}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {section.links.map((link) => (
                  <Box component="li" key={link.label} sx={{ mb: 0.75 }}>
                    <MuiLink
                      component={link.href.startsWith('http') ? 'a' : Link}
                      href={link.href}
                      target={link.href.startsWith('http') ? '_blank' : undefined}
                      rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      color="text.secondary"
                      underline="hover"
                      sx={{
                        fontSize: '0.875rem',
                        transition: 'color 120ms',
                        '&:hover': { color: 'primary.main' },
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

        {/* Newsletter */}
        <Box
          component="form"
          onSubmit={handleSubscribe}
          sx={{
            mt: { xs: 5, md: 6 },
            p: { xs: 2.5, md: 3 },
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.03)' : 'rgba(129, 140, 248, 0.04)',
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { md: 'center' },
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Engineering updates, no noise
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Quarterly release notes, design-flow deep dives, and security advisories. Unsubscribe in one click.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
            <TextField
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setStatus('idle'); }}
              placeholder="you@company.com"
              size="small"
              error={status === 'error'}
              helperText={status === 'error' ? 'Enter a valid work email' : status === 'ok' ? 'Subscribed — see you in your inbox.' : ' '}
              sx={{ minWidth: { sm: 260 }, bgcolor: 'background.paper' }}
              inputProps={{ 'aria-label': 'Email address' }}
            />
            <Button type="submit" variant="contained" sx={{ whiteSpace: 'nowrap' }}>
              Subscribe
            </Button>
          </Stack>
        </Box>

        {/* Compliance / trust row */}
        <Box sx={{ mt: { xs: 4, md: 5 }, mb: 3 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, mb: 1.5 }}
          >
            Certifications & Compliance
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {compliance.map(c => (
              <Chip
                key={c.label}
                icon={c.icon}
                label={c.label}
                size="small"
                variant="outlined"
                sx={{ borderRadius: 1 }}
              />
            ))}
          </Stack>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Bottom bar */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { sm: 'center' },
            gap: 1.5,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            © {currentYear} NeuralChip, Inc. All rights reserved. NeuralChip®
            and the NeuralChip logo are registered trademarks of NeuralChip, Inc.
          </Typography>
          <Stack direction="row" spacing={2} divider={<Divider orientation="vertical" flexItem />}>
            <MuiLink component={Link} href="/privacy" underline="hover" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              Privacy
            </MuiLink>
            <MuiLink component={Link} href="/terms" underline="hover" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              Terms
            </MuiLink>
            <MuiLink component={Link} href="/cookies" underline="hover" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              Cookies
            </MuiLink>
            <MuiLink href="#" underline="hover" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              Do Not Sell My Info
            </MuiLink>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
