'use client';

import { Box, Container, Typography, Button, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';

interface HeroProps {
  title: string;
  subtitle: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  backgroundGradient?: boolean;
}

export default function Hero({ title, subtitle, primaryCta, secondaryCta, backgroundGradient = true }: HeroProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        position: 'relative',
        py: { xs: 8, md: 12, lg: 16 },
        background: backgroundGradient
          ? theme.palette.mode === 'light'
            ? 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 50%, #DDD6FE 100%)'
            : 'linear-gradient(135deg, #1E293B 0%, #312E81 50%, #581C87 100%)'
          : 'transparent',
        overflow: 'hidden',
      }}
    >
      {/* Decorative background elements */}
      {backgroundGradient && (
        <>
          <Box
            sx={{
              position: 'absolute',
              top: -100,
              right: -100,
              width: 400,
              height: 400,
              borderRadius: '50%',
              background: theme.palette.mode === 'light'
                ? 'radial-gradient(circle, rgba(79, 70, 229, 0.1) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(129, 140, 248, 0.2) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: -100,
              left: -100,
              width: 400,
              height: 400,
              borderRadius: '50%',
              background: theme.palette.mode === 'light'
                ? 'radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(34, 211, 238, 0.2) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
        </>
      )}

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ textAlign: 'center', maxWidth: 800, mx: 'auto' }}>
          <Typography
            variant="h1"
            sx={{
              fontWeight: 700,
              mb: 3,
              fontSize: { xs: '2.5rem', sm: '3rem', md: '3.5rem', lg: '4rem' },
              background: theme.palette.mode === 'light'
                ? 'linear-gradient(135deg, #312E81 0%, #4F46E5 50%, #06B6D4 100%)'
                : 'linear-gradient(135deg, #E0E7FF 0%, #818CF8 50%, #22D3EE 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {title}
          </Typography>

          <Typography
            variant="h5"
            color="text.secondary"
            sx={{
              mb: 5,
              fontSize: { xs: '1.125rem', sm: '1.25rem', md: '1.5rem' },
              fontWeight: 400,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </Typography>

          {(primaryCta || secondaryCta) && (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              justifyContent="center"
              sx={{ mb: 2 }}
            >
              {primaryCta && (
                <Button
                  component={Link}
                  href={primaryCta.href}
                  variant="contained"
                  size="large"
                  sx={{
                    px: 4,
                    py: 1.5,
                    fontSize: '1rem',
                    fontWeight: 600,
                  }}
                  endIcon={
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      arrow_forward
                    </span>
                  }
                >
                  {primaryCta.label}
                </Button>
              )}
              {secondaryCta && (
                <Button
                  component={Link}
                  href={secondaryCta.href}
                  variant="outlined"
                  size="large"
                  sx={{
                    px: 4,
                    py: 1.5,
                    fontSize: '1rem',
                    fontWeight: 600,
                  }}
                  endIcon={
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      description
                    </span>
                  }
                >
                  {secondaryCta.label}
                </Button>
              )}
            </Stack>
          )}
        </Box>
      </Container>
    </Box>
  );
}
