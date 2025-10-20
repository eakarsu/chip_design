'use client';

import { createTheme, ThemeOptions } from '@mui/material/styles';

// MD3 Color Tokens
const md3Tokens = {
  light: {
    primary: '#4F46E5', // Indigo 600
    onPrimary: '#FFFFFF',
    primaryContainer: '#E0E7FF', // Indigo 100
    onPrimaryContainer: '#312E81', // Indigo 900

    secondary: '#06B6D4', // Cyan 500
    onSecondary: '#FFFFFF',
    secondaryContainer: '#CFFAFE', // Cyan 100
    onSecondaryContainer: '#164E63', // Cyan 900

    tertiary: '#A855F7', // Purple 500
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#F3E8FF', // Purple 100
    onTertiaryContainer: '#581C87', // Purple 900

    error: '#DC2626', // Red 600
    onError: '#FFFFFF',
    errorContainer: '#FEE2E2', // Red 100
    onErrorContainer: '#7F1D1D', // Red 900

    background: '#FAFAFA', // Neutral 50
    onBackground: '#1F2937', // Gray 800

    surface: '#FFFFFF',
    onSurface: '#1F2937',
    surfaceVariant: '#F1F5F9', // Slate 100
    onSurfaceVariant: '#475569', // Slate 600

    outline: '#CBD5E1', // Slate 300
    outlineVariant: '#E2E8F0', // Slate 200

    inverseSurface: '#1E293B', // Slate 800
    inverseOnSurface: '#F8FAFC', // Slate 50
    inversePrimary: '#818CF8', // Indigo 400

    shadow: '#000000',
    scrim: '#000000',

    surfaceTint: '#4F46E5',
  },
  dark: {
    primary: '#818CF8', // Indigo 400
    onPrimary: '#312E81', // Indigo 900
    primaryContainer: '#4338CA', // Indigo 700
    onPrimaryContainer: '#E0E7FF', // Indigo 100

    secondary: '#22D3EE', // Cyan 400
    onSecondary: '#164E63', // Cyan 900
    secondaryContainer: '#0E7490', // Cyan 700
    onSecondaryContainer: '#CFFAFE', // Cyan 100

    tertiary: '#C084FC', // Purple 400
    onTertiary: '#581C87', // Purple 900
    tertiaryContainer: '#7C3AED', // Purple 600
    onTertiaryContainer: '#F3E8FF', // Purple 100

    error: '#F87171', // Red 400
    onError: '#7F1D1D', // Red 900
    errorContainer: '#B91C1C', // Red 700
    onErrorContainer: '#FEE2E2', // Red 100

    background: '#0F172A', // Slate 900
    onBackground: '#F1F5F9', // Slate 100

    surface: '#1E293B', // Slate 800
    onSurface: '#F1F5F9', // Slate 100
    surfaceVariant: '#334155', // Slate 700
    onSurfaceVariant: '#CBD5E1', // Slate 300

    outline: '#475569', // Slate 600
    outlineVariant: '#334155', // Slate 700

    inverseSurface: '#F1F5F9', // Slate 100
    inverseOnSurface: '#1E293B', // Slate 800
    inversePrimary: '#4F46E5', // Indigo 600

    shadow: '#000000',
    scrim: '#000000',

    surfaceTint: '#818CF8',
  },
};

// MD3 Elevation (tonal surface colors)
const elevationLight = {
  0: '#FFFFFF',
  1: '#F8FAFC', // Slate 50
  2: '#F1F5F9', // Slate 100
  3: '#E2E8F0', // Slate 200
  4: '#CBD5E1', // Slate 300
  5: '#94A3B8', // Slate 400
};

const elevationDark = {
  0: '#1E293B', // Slate 800
  1: '#334155', // Slate 700
  2: '#475569', // Slate 600
  3: '#64748B', // Slate 500
  4: '#94A3B8', // Slate 400
  5: '#CBD5E1', // Slate 300
};

// MD3 Typography Scale
const typography = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontFamilyCode: '"JetBrains Mono", "Fira Code", Consolas, monospace',

  // Display
  displayLarge: {
    fontFamily: 'Inter',
    fontSize: '3.5625rem', // 57px
    fontWeight: 400,
    lineHeight: 1.12,
    letterSpacing: '-0.25px',
  },
  displayMedium: {
    fontFamily: 'Inter',
    fontSize: '2.8125rem', // 45px
    fontWeight: 400,
    lineHeight: 1.16,
    letterSpacing: '0px',
  },
  displaySmall: {
    fontFamily: 'Inter',
    fontSize: '2.25rem', // 36px
    fontWeight: 400,
    lineHeight: 1.22,
    letterSpacing: '0px',
  },

  // Headline
  headlineLarge: {
    fontFamily: 'Inter',
    fontSize: '2rem', // 32px
    fontWeight: 600,
    lineHeight: 1.25,
    letterSpacing: '0px',
  },
  headlineMedium: {
    fontFamily: 'Inter',
    fontSize: '1.75rem', // 28px
    fontWeight: 600,
    lineHeight: 1.29,
    letterSpacing: '0px',
  },
  headlineSmall: {
    fontFamily: 'Inter',
    fontSize: '1.5rem', // 24px
    fontWeight: 600,
    lineHeight: 1.33,
    letterSpacing: '0px',
  },

  // Title
  titleLarge: {
    fontFamily: 'Inter',
    fontSize: '1.375rem', // 22px
    fontWeight: 500,
    lineHeight: 1.27,
    letterSpacing: '0px',
  },
  titleMedium: {
    fontFamily: 'Inter',
    fontSize: '1rem', // 16px
    fontWeight: 500,
    lineHeight: 1.5,
    letterSpacing: '0.15px',
  },
  titleSmall: {
    fontFamily: 'Inter',
    fontSize: '0.875rem', // 14px
    fontWeight: 500,
    lineHeight: 1.43,
    letterSpacing: '0.1px',
  },

  // Body
  bodyLarge: {
    fontFamily: 'Inter',
    fontSize: '1rem', // 16px
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: '0.5px',
  },
  bodyMedium: {
    fontFamily: 'Inter',
    fontSize: '0.875rem', // 14px
    fontWeight: 400,
    lineHeight: 1.43,
    letterSpacing: '0.25px',
  },
  bodySmall: {
    fontFamily: 'Inter',
    fontSize: '0.75rem', // 12px
    fontWeight: 400,
    lineHeight: 1.33,
    letterSpacing: '0.4px',
  },

  // Label
  labelLarge: {
    fontFamily: 'Inter',
    fontSize: '0.875rem', // 14px
    fontWeight: 500,
    lineHeight: 1.43,
    letterSpacing: '0.1px',
  },
  labelMedium: {
    fontFamily: 'Inter',
    fontSize: '0.75rem', // 12px
    fontWeight: 500,
    lineHeight: 1.33,
    letterSpacing: '0.5px',
  },
  labelSmall: {
    fontFamily: 'Inter',
    fontSize: '0.6875rem', // 11px
    fontWeight: 500,
    lineHeight: 1.45,
    letterSpacing: '0.5px',
  },
};

// MD3 Shape
const shape = {
  borderRadius: 12, // Medium corner
  borderRadiusSmall: 8,
  borderRadiusLarge: 16,
  borderRadiusExtraLarge: 28,
};

// MD3 Motion
const motion = {
  duration: {
    short1: 50,
    short2: 100,
    short3: 150,
    short4: 200,
    medium1: 250,
    medium2: 300,
    medium3: 350,
    medium4: 400,
    long1: 450,
    long2: 500,
    long3: 550,
    long4: 600,
    extraLong1: 700,
    extraLong2: 800,
    extraLong3: 900,
    extraLong4: 1000,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    standardDecelerate: 'cubic-bezier(0, 0, 0, 1)',
    standardAccelerate: 'cubic-bezier(0.3, 0, 1, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  },
};

// Create theme factory
export const createMD3Theme = (mode: 'light' | 'dark') => {
  const tokens = mode === 'light' ? md3Tokens.light : md3Tokens.dark;
  const elevation = mode === 'light' ? elevationLight : elevationDark;

  const themeOptions: ThemeOptions = {
    palette: {
      mode,
      primary: {
        main: tokens.primary,
        contrastText: tokens.onPrimary,
        light: tokens.primaryContainer,
        dark: tokens.onPrimaryContainer,
      },
      secondary: {
        main: tokens.secondary,
        contrastText: tokens.onSecondary,
        light: tokens.secondaryContainer,
        dark: tokens.onSecondaryContainer,
      },
      error: {
        main: tokens.error,
        contrastText: tokens.onError,
        light: tokens.errorContainer,
        dark: tokens.onErrorContainer,
      },
      background: {
        default: tokens.background,
        paper: tokens.surface,
      },
      text: {
        primary: tokens.onSurface,
        secondary: tokens.onSurfaceVariant,
      },
      divider: tokens.outline,
    },
    typography: {
      fontFamily: typography.fontFamily,
      h1: typography.displayLarge,
      h2: typography.displayMedium,
      h3: typography.displaySmall,
      h4: typography.headlineLarge,
      h5: typography.headlineMedium,
      h6: typography.headlineSmall,
      subtitle1: typography.titleLarge,
      subtitle2: typography.titleMedium,
      body1: typography.bodyLarge,
      body2: typography.bodyMedium,
      caption: typography.bodySmall,
      button: typography.labelLarge,
      overline: typography.labelSmall,
    },
    shape: {
      borderRadius: shape.borderRadius,
    },
    spacing: 8, // MD3 8dp grid
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: {
            scrollBehavior: 'smooth',
          },
          body: {
            fontFamily: typography.fontFamily,
            fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
          },
          code: {
            fontFamily: typography.fontFamilyCode,
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: shape.borderRadiusLarge,
            textTransform: 'none',
            fontWeight: 500,
            padding: '10px 24px',
            transition: `all ${motion.duration.short4}ms ${motion.easing.standard}`,
          },
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: `0px 1px 2px rgba(0, 0, 0, 0.3), 0px 2px 6px 2px rgba(0, 0, 0, 0.15)`,
            },
          },
          outlined: {
            borderWidth: 1,
            '&:hover': {
              borderWidth: 1,
              backgroundColor: mode === 'light' ? 'rgba(79, 70, 229, 0.04)' : 'rgba(129, 140, 248, 0.08)',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: shape.borderRadius,
            boxShadow: 'none',
            border: `1px solid ${tokens.outlineVariant}`,
            transition: `all ${motion.duration.short4}ms ${motion.easing.standard}`,
            '&:hover': {
              boxShadow: `0px 1px 2px rgba(0, 0, 0, 0.3), 0px 1px 3px 1px rgba(0, 0, 0, 0.15)`,
              borderColor: tokens.outline,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          elevation0: {
            backgroundColor: elevation[0],
          },
          elevation1: {
            backgroundColor: elevation[1],
            boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.3), 0px 1px 3px 1px rgba(0, 0, 0, 0.15)',
          },
          elevation2: {
            backgroundColor: elevation[2],
            boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.3), 0px 2px 6px 2px rgba(0, 0, 0, 0.15)',
          },
          elevation3: {
            backgroundColor: elevation[3],
            boxShadow: '0px 4px 8px 3px rgba(0, 0, 0, 0.15), 0px 1px 3px rgba(0, 0, 0, 0.3)',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: 'none',
            borderBottom: `1px solid ${tokens.outlineVariant}`,
            backgroundColor: tokens.surface,
            color: tokens.onSurface,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: shape.borderRadiusSmall,
            fontWeight: 500,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: shape.borderRadiusSmall,
            },
          },
        },
      },
      MuiLink: {
        styleOverrides: {
          root: {
            textDecoration: 'none',
            '&:hover': {
              textDecoration: 'underline',
            },
          },
        },
      },
    },
  };

  return createTheme(themeOptions);
};

// Export default themes
export const lightTheme = createMD3Theme('light');
export const darkTheme = createMD3Theme('dark');

// Export tokens for direct use
export { md3Tokens, motion, shape, typography };
