import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@/theme';
import ProjectSpecificationWizard from '../../app/workspace/projects/new/page';

const mockPush = jest.fn();
const originalFetch = globalThis.fetch;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const renderWizard = () =>
  render(
    <ThemeProvider theme={lightTheme}>
      <ProjectSpecificationWizard />
    </ThemeProvider>
  );

describe('Start from specification wizard', () => {
  beforeEach(() => mockPush.mockClear());

  it('offers the three journey templates and the 14-phase roadmap', () => {
    renderWizard();

    expect(screen.getByRole('heading', { name: 'Create a Journey project' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use GCD' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use FIFO' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use MAC' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: /^\d+\. / })).toHaveLength(14);
    expect(screen.getByText(/retained evidence and an explicit human approval/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Architecture catalog' })).toHaveAttribute('href', '/architectures');
  });

  it('reviews the selected template requirements before creating the project', () => {
    renderWizard();

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'GCD bring-up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use GCD' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review requirements' }));

    expect(screen.getByRole('heading', { name: 'Generated requirements summary' })).toBeVisible();
    expect(screen.getByText('Reset clears all externally visible valid/busy state.')).toBeVisible();
    expect(screen.getByText('latency_cycles ≤ 260 cycles')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled();
  });

  it('derives a reviewable requirements list from a pasted specification', () => {
    renderWizard();

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'Pasted block' } });
    fireEvent.click(screen.getByRole('button', { name: 'Paste a specification' }));
    fireEvent.change(screen.getByLabelText(/paste the specification/i), {
      target: {
        value:
          'The block shall accept one sample per clock.\nIt must assert valid for exactly one cycle.\nReset shall clear the accumulator.',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review requirements' }));

    expect(screen.getByText('The block shall accept one sample per clock.')).toBeVisible();
    expect(screen.getByText('It must assert valid for exactly one cycle.')).toBeVisible();
    expect(screen.getByText(/Published reference contract/)).toBeVisible();
  });

  it('reports API errors in an alert without navigating', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Workspace operation failed', message: 'Storage unavailable' }),
    }) as typeof fetch;
    try {
      renderWizard();
      fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'Failing project' } });
      fireEvent.click(screen.getByRole('button', { name: 'Review requirements' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

      expect(await screen.findByText('Storage unavailable')).toBeVisible();
      expect(mockPush).not.toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
      if (originalFetch) globalThis.fetch = originalFetch;
      else delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
  });
});
