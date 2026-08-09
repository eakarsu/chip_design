import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import SideNav from '@/components/SideNav';
import { lightTheme } from '@/theme';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    logout: jest.fn(),
  }),
}));

jest.mock('@/components/ThemeSwitcher', () => function MockThemeSwitcher() {
  return <button type="button">Theme</button>;
});

jest.mock('@/components/SearchDialog', () => function MockSearchDialog() {
  return null;
});

describe('SideNav navigation controls', () => {
  it('does not add a generic Back button to normal pages', () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <SideNav open onClose={jest.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('navigation', { name: 'Side navigation' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /go back/i })).not.toBeInTheDocument();
  });
});
