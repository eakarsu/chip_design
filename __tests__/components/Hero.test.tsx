import { render, screen } from '@testing-library/react';
import Hero from '@/components/Hero';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@/theme';

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={lightTheme}>
      {component}
    </ThemeProvider>
  );
};

describe('Hero Component', () => {
  it('should render title and subtitle', () => {
    renderWithTheme(
      <Hero
        title="Test Title"
        subtitle="Test Subtitle"
      />
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
  });

  it('should render CTA buttons when provided', () => {
    renderWithTheme(
      <Hero
        title="Test"
        subtitle="Test"
        primaryCta={{ label: 'Primary', href: '/primary' }}
        secondaryCta={{ label: 'Secondary', href: '/secondary' }}
      />
    );

    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Secondary')).toBeInTheDocument();
  });

  it('should not render CTA buttons when not provided', () => {
    renderWithTheme(
      <Hero
        title="Test"
        subtitle="Test"
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
