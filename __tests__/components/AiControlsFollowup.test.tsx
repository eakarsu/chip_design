import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '../../app/login/page';
import AIFeaturesPage from '../../app/ai-features/page';
import ProfessionalAIResult from '@/components/ai/ProfessionalAIResult';
import AcceleratorArchitectureLab from '@/components/AcceleratorArchitectureLab';
import DesignFlowGenerator from '@/components/DesignFlowGenerator';
import AIAlgorithmSelector from '@/components/AIAlgorithmSelector';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock('@/components/AIFeaturesDashboard', () => ({ __esModule: true, default: () => <div /> }));
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

it('fills configured demo credentials without submitting', async () => {
  const mockFetch = jest.fn(async (_url: string) => ({ ok: true, json: async () => ({ email: 'fixture@example.test', password: 'fixture-only' }) }));
  global.fetch = mockFetch as unknown as typeof fetch;
  render(<LoginPage />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Fill Demo Credentials' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Fill Demo Credentials' }));
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('fixture@example.test');
  expect(document.querySelector('input[name="password"]')).toHaveValue('fixture-only');
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/demo-credentials');
});

it('keeps missing demo credentials explicit', async () => {
  global.fetch = jest.fn(async () => ({ ok: false })) as unknown as typeof fetch;
  render(<LoginPage />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Fill Demo Credentials' })).toBeDisabled());
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('');
});

it('fills layout prompts, preserves a real upload, and never generates', async () => {
  const mockFetch = jest.fn(); global.fetch = mockFetch as typeof fetch;
  render(<AIFeaturesPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Visual Analysis' }));
  fireEvent.click(screen.getByRole('button', { name: /Load Sample/ }));
  expect(screen.getByRole('textbox', { name: /Optional question/ })).not.toHaveValue('');
  expect(screen.getByRole('button', { name: 'Analyze Layout' })).toBeDisabled();
  expect(screen.getByText(/Upload a real layout image/)).toBeInTheDocument();
  const file = new File(['fixture image'], 'retained-layout.png', { type: 'image/png' });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Analyze Layout' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: /Load Sample/ }));
  expect(screen.getByText('Selected: retained-layout.png')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Analyze Layout' })).toBeEnabled();
  expect(mockFetch).not.toHaveBeenCalled();
});

it('fills each architecture field from distinct presets without sending an AI request', () => {
  const mockFetch = jest.fn(); global.fetch = mockFetch as typeof fetch;
  render(<AcceleratorArchitectureLab />);
  for (const label of ['Edge inference', 'Cloud GEMM', 'FPGA prototype']) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByRole('spinbutton', { name: 'M rows' })).not.toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: 'Production volume' })).not.toHaveValue('');
  }
  expect(screen.getByRole('spinbutton', { name: 'M rows' })).toHaveValue(512);
  expect(mockFetch).not.toHaveBeenCalled();
});

it('renders nested facts and preserves false, zero, and empty string', () => {
  const { container } = render(<ProfessionalAIResult result={{ accepted: false, count: 0, note: '', checks: [{ label: 'Clock', passed: false }] }} />);
  expect(screen.getByText('Accepted')).toBeInTheDocument();
  expect(screen.getAllByText('No').length).toBeGreaterThan(0);
  expect(screen.getByText('0')).toBeInTheDocument();
  expect(screen.getByText('Empty string')).toBeInTheDocument();
  expect(screen.getByText('Clock')).toBeInTheDocument();
  expect(container.textContent).not.toContain('"accepted"');
});

it('cycles every AI feature sample through filled form fields without generation', () => {
  const mockFetch = jest.fn(); global.fetch = mockFetch as typeof fetch;
  render(<AIFeaturesPage />);
  for (const tab of ['Visual Analysis', 'Documentation', 'Search & Discovery', 'Performance & Optimization']) {
    fireEvent.click(screen.getByRole('tab', { name: tab }));
    const buttons = screen.getAllByText(/Load Sample/).map(label => label.closest('button')!);
    for (const button of buttons) {
      const formCard = button.closest('.MuiCard-root, .MuiPaper-root');
      expect(formCard).not.toBeNull();
      const presetButtons = formCard!.querySelectorAll('[data-testid="sample-preset-buttons"] button');
      expect(presetButtons.length).toBeGreaterThanOrEqual(2);
      for (const preset of presetButtons) {
        fireEvent.click(preset);
        const fields = formCard!.querySelectorAll('input:not([type="file"]), textarea');
        expect(fields.length).toBeGreaterThan(0);
        fields.forEach(field => expect((field as HTMLInputElement).value.trim()).not.toBe(''));
      }
    }
  }
  expect(mockFetch).not.toHaveBeenCalled();
});

it('fills flow and algorithm selector samples without generating', () => {
  const mockFetch = jest.fn(); global.fetch = mockFetch as typeof fetch;
  const { unmount } = render(<DesignFlowGenerator />);
  const flowSample = screen.getByRole('button', { name: 'load next design flow sample' });
  expect(screen.getByRole('button', { name: 'IoT sensor' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ML accelerator' }));
  expect(screen.getByRole('spinbutton', { name: 'Gate Count' })).toHaveValue(50000);
  for (let index = 0; index < 4; index++) {
    fireEvent.click(flowSample);
    for (const label of ['Design Requirements', 'Gate Count', 'Power Budget (mW)', 'Frequency (MHz)']) {
      expect(screen.getByRole(label === 'Design Requirements' ? 'textbox' : 'spinbutton', { name: label })).not.toHaveValue('');
    }
  }
  unmount();
  render(<AIAlgorithmSelector open onClose={() => {}} onSelect={() => {}} />);
  const querySample = screen.getByRole('button', { name: 'load next query sample' });
  fireEvent.click(screen.getByRole('button', { name: 'Routing' }));
  expect((screen.getByPlaceholderText(/I need to place/) as HTMLInputElement).value).toContain('Route 200 signal nets');
  for (let index = 0; index < 6; index++) {
    fireEvent.click(querySample);
    expect(screen.getByPlaceholderText(/I need to place/)).not.toHaveValue('');
  }
  expect(mockFetch).not.toHaveBeenCalled();
});
