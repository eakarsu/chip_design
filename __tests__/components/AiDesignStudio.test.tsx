import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AiDesignStudio from '@/components/commercial/AiDesignStudio';
import CapabilityExecutionWorkbench from '@/components/commercial/CapabilityExecutionWorkbench';
import type { WorkspaceBundle } from '@/lib/commercial/types';

const workspace = {
  featureRecords: [],
  aiReviews: [],
} as unknown as WorkspaceBundle;
const originalFetch = globalThis.fetch;

describe('AI Design Studio', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  it('shows the visible governed AI design sequence and switches workflows', () => {
    render(
      <AiDesignStudio
        workspace={workspace}
        projectId="project-1"
        onReload={jest.fn(async () => undefined)}
        onOpenAction={jest.fn()}
        onBrief={jest.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: /Design with AI, with every engineering step visible/i })).toBeVisible();
    expect(screen.getByText('1. Capture design intent')).toBeVisible();
    expect(screen.getByText('4. Generate the AI design plan')).toBeVisible();
    expect(screen.getByText('6. Record the architecture decision')).toBeVisible();

    fireEvent.click(screen.getByText('Verification', { selector: 'p' }));
    expect(screen.getByRole('heading', { name: 'Verification closure workflow' })).toBeVisible();
    expect(screen.getByText('1. Freeze the verification plan')).toBeVisible();
  });

  it('uses guided action fields by default and retains expert JSON as an explicit mode', () => {
    render(
      <CapabilityExecutionWorkbench
        capabilityId="verification-closure"
        capabilityTitle="Verification Closure Hub"
        projectId="project-1"
        initialActionId="uvm-regression"
        open
        onClose={jest.fn()}
        onComplete={jest.fn(async () => undefined)}
      />
    );

    expect(screen.getByRole('tab', { name: 'Guided fields' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('suite')).toBeVisible();
    expect(screen.getByLabelText('tests')).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: 'Expert JSON' }));
    expect(screen.getByLabelText('Structured JSON input')).toBeVisible();
  });

  it('loads tenant-owned EDA projects instead of exposing the sandbox placeholder', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        projects: [{
          id: 'eda-project-1',
          name: 'Atlas governed flow',
          pdkRef: 'sky130-test',
          createdAt: '2026-08-09T00:00:00.000Z',
        }],
      }),
    } as Response);
    globalThis.fetch = fetchMock as typeof fetch;

    render(
      <CapabilityExecutionWorkbench
        capabilityId="ai-ppa-closure"
        capabilityTitle="AI Timing and PPA Closure"
        projectId="project-1"
        initialActionId="sandbox-rerun"
        open
        onClose={jest.fn()}
        onComplete={jest.fn(async () => undefined)}
      />
    );

    await waitFor(() => expect(screen.getByLabelText('Governed EDA project')).toHaveTextContent('Atlas governed flow'));
    expect(screen.queryByDisplayValue('replace-with-governed-eda-project-id')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run and retain evidence' })).toBeEnabled();
  });
});
