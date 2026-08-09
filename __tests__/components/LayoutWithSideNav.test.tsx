import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import LayoutWithSideNav from '@/components/LayoutWithSideNav';
import { lightTheme } from '@/theme';

jest.mock('@/components/SideNav', () => ({
  __esModule: true,
  SIDENAV_WIDTH: 240,
  default: ({ open, onClose, variant }: { open: boolean; onClose: () => void; variant: string }) => (
    <div data-testid="side-navigation" data-open={String(open)} data-variant={variant}>
      {open && <button onClick={onClose}>Close test navigation</button>}
    </div>
  ),
}));

jest.mock('@/components/Footer', () => function MockFooter() { return <footer>Footer</footer>; });
jest.mock('@/components/Breadcrumbs', () => function MockBreadcrumbs() { return <div>Breadcrumbs</div>; });
jest.mock('@/components/KeyboardShortcuts', () => function MockKeyboardShortcuts() { return null; });

describe('LayoutWithSideNav mobile navigation', () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  it('opens and closes the temporary side navigation from a visible Menu button', () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <LayoutWithSideNav><main>Mobile content</main></LayoutWithSideNav>
      </ThemeProvider>,
    );

    const menu = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(menu).toBeVisible();
    expect(menu).toHaveTextContent('Menu');
    expect(screen.getByTestId('side-navigation')).toHaveAttribute('data-variant', 'temporary');
    expect(screen.getByTestId('side-navigation')).toHaveAttribute('data-open', 'false');

    fireEvent.click(menu);
    expect(screen.getByTestId('side-navigation')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Close test navigation' }));
    expect(screen.getByTestId('side-navigation')).toHaveAttribute('data-open', 'false');
  });
});
