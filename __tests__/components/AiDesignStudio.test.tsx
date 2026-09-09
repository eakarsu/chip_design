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

  it('shows all 14 canonical design phases and switches operational workflows', () => {
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
    expect(screen.getByRole('heading', { name: 'Canonical 14-step AI design sequence' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: /^\d+\./ })).toHaveLength(14);
    expect(screen.getByRole('link', { name: '1. Product requirements & acceptance criteria' })).toHaveAttribute(
      'href',
      '/governed-ai/lifecycle?projectId=project-1#phase-requirements'
    );
    expect(screen.getByRole('link', { name: '14. Manufacturing, package & silicon validation' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Seven operational AI workflows' })).toBeVisible();
    expect(screen.getByText('1. Capture design intent')).toBeVisible();
    expect(screen.getByText('4. Generate the AI design plan')).toBeVisible();
    expect(screen.getByText('6. Record the architecture decision')).toBeVisible();

    fireEvent.click(screen.getByText('Verification', { selector: 'p' }));
    expect(screen.getByRole('heading', { name: 'Verification closure workflow' })).toBeVisible();
    expect(screen.getByText('1. Freeze the verification plan')).toBeVisible();
  });

  it('disables advancement until the preceding evidence and human decision are complete', () => {
    render(<AiDesignStudio workspace={workspace} projectId="project-1" onReload={jest.fn(async () => undefined)} onOpenAction={jest.fn()} onBrief={jest.fn()} />);
    fireEvent.click(screen.getByText('7. Release the governed design baseline'));
    expect(screen.getByRole('button', { name: 'Retain step evidence' })).toBeDisabled();
  });

  it('selects retained signed manifests instead of accepting a signature-verification checkbox', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ workspace: { featureRecords: [{ id: 'manifest-1', projectId: 'project-1', feature: 'tapeout-release', recordType: 'signed-manifest', status: 'completed', title: 'Release candidate', createdAt: '2026-09-01T00:00:00.000Z' }] } }) }) as typeof fetch;
    render(<CapabilityExecutionWorkbench capabilityId="tapeout-release" capabilityTitle="Tapeout" projectId="project-1" initialActionId="release-ceremony" open onClose={jest.fn()} onComplete={jest.fn(async () => undefined)} />);
    await waitFor(() => expect(screen.getByLabelText('Retained signed manifest')).toHaveTextContent('Release candidate'));
    fireEvent.click(screen.getByRole('tab', { name: 'Expert JSON' }));
    expect(screen.getByLabelText('Structured JSON input')).toHaveValue(JSON.stringify({ manifestRecordId: 'manifest-1' }, null, 2));
  });

  it('requests approval for the exact signed manifest returned by execution', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ record: { id: 'signed-record-1' }, execution: { actionId: 'signed-manifest', status: 'completed', summary: 'Manifest signed', metrics: {}, findings: [], recommendations: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ approval: { status: 'pending' } }) });
    globalThis.fetch = fetchMock as typeof fetch;
    render(<CapabilityExecutionWorkbench capabilityId="tapeout-release" capabilityTitle="Tapeout" projectId="project-1" initialActionId="signed-manifest" open onClose={jest.fn()} onComplete={jest.fn(async () => undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run and retain evidence' }));
    const request = await screen.findByRole('button', { name: 'Request independent release approval' });
    await waitFor(() => expect(request).toBeEnabled());
    fireEvent.click(request);
    await screen.findByText(/Release approval is pending/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ projectId: 'project-1', targetType: 'signoff', targetId: 'signed-record-1' });
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
