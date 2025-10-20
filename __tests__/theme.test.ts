import { lightTheme, darkTheme } from '@/theme';

describe('Theme Configuration', () => {
  it('should create light theme with correct palette', () => {
    expect(lightTheme.palette.mode).toBe('light');
    expect(lightTheme.palette.primary.main).toBe('#4F46E5');
    expect(lightTheme.palette.secondary.main).toBe('#06B6D4');
  });

  it('should create dark theme with correct palette', () => {
    expect(darkTheme.palette.mode).toBe('dark');
    expect(darkTheme.palette.primary.main).toBe('#818CF8');
    expect(darkTheme.palette.secondary.main).toBe('#22D3EE');
  });

  it('should have correct typography scale', () => {
    expect(lightTheme.typography.fontFamily).toContain('Inter');
    expect(lightTheme.typography.h1).toBeDefined();
    expect(lightTheme.typography.body1).toBeDefined();
  });

  it('should have MD3 shape tokens', () => {
    expect(lightTheme.shape.borderRadius).toBe(12);
  });

  it('should configure button components', () => {
    expect(lightTheme.components?.MuiButton).toBeDefined();
    expect(lightTheme.components?.MuiButton?.styleOverrides).toBeDefined();
  });
});
