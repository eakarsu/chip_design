import { fireEvent, render, screen } from '@testing-library/react';
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
  const renderNav = () =>
    render(
      <ThemeProvider theme={lightTheme}>
        <SideNav open onClose={jest.fn()} />
      </ThemeProvider>,
    );

  beforeEach(() => localStorage.clear());

  it('does not add a generic Back button to normal pages', () => {
    renderNav();

    expect(screen.getByRole('navigation', { name: 'Side navigation' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /go back/i })).not.toBeInTheDocument();
  });

  it('shows only the active group by default and hides lifecycle phase links', () => {
    renderNav();

    expect(screen.getAllByRole('link', { name: 'Dashboard' })[0]).toBeVisible();
    expect(screen.queryByRole('link', { name: 'ATPG' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^0\d · / })).not.toBeInTheDocument();
  });

  it('expands a collapsed group from its header', () => {
    renderNav();

    fireEvent.click(screen.getByRole('button', { name: 'Expand DFT & Test section' }));
    expect(screen.getByRole('link', { name: 'ATPG' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse DFT & Test section' }));
    expect(screen.queryByRole('link', { name: 'ATPG' })).not.toBeInTheDocument();
  });

  it('pins pages into a Favorites group and unpins them', () => {
    renderNav();

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Dashboard to favorites' })[0]);
    expect(screen.getByText('Favorites')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Unpin Dashboard' }));
    expect(screen.queryByText('Favorites')).not.toBeInTheDocument();
  });

  it('records the current page under Recent', () => {
    renderNav();

    expect(screen.getByText('Recent')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(1);
  });
});
