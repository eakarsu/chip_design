import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AcceleratorArchitectureLab from '@/components/AcceleratorArchitectureLab';

const originalFetch = globalThis.fetch;

const review = JSON.stringify({
  headline: 'Architecture requires measured memory and timing evidence',
  executiveSummary: 'The analytical model supports exploration but does not close phase 2.',
  verdict: 'PROCEED WITH CONDITIONS',
  risk: 'MODERATE',
  confidence: 78,
  metrics: [{ label: 'Sustained compute', value: 'Analytical estimate only' }],
  currentGate: {
    phase: '2 Architecture & partitioning',
    status: 'IN PROGRESS',
    closureCriteria: ['Measured workload and synthesis evidence'],
    missingEvidence: ['SRAM compiler report'],
  },
  engineeringFindings: [],
  prioritizedActions: [],
  nextThreePhases: [],
  assumptions: ['Dense GEMM is representative'],
  humanReviewGates: ['Chief architect approves the frozen architecture'],
});

describe('AcceleratorArchitectureLab', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  it('shows the coupled workload, communication, timing and implementation decisions', () => {
    render(<AcceleratorArchitectureLab />);

    expect(screen.getByRole('heading', { name: /Design compute, memory, communication and clocks together/i })).toBeVisible();
    expect(screen.getByLabelText('Array rows')).toHaveValue(64);
    expect(screen.getByText('Coarse TPU-style array')).toBeVisible();
    expect(screen.getByText('Fine GPU-style tiles')).toBeVisible();
    expect(screen.getByText('Splittable hybrid array', { selector: 'strong' })).toBeVisible();
    expect(screen.getByText(/Weights fit in local SRAM/i)).toBeVisible();
    expect(screen.getByText(/Recommendation: ASIC/i)).toBeVisible();
    expect(screen.getByText(/Relative index:/i)).toBeVisible();
  });

  it('sends the exact analytical result and alternatives to the AI phase-2 reviewer', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'review-1',
        provider: 'test-provider',
        model: 'test-model',
        choices: [{ message: { content: review } }],
      }),
    } as Response);
    globalThis.fetch = fetchMock as typeof fetch;

    render(<AcceleratorArchitectureLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Run AI design review' }));

    await waitFor(() => expect(screen.getByText('Architecture requires measured memory and timing evidence')).toBeVisible());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.method).toBe('POST');
    const body = JSON.parse(String(request.body));
    expect(body.designContext.currentParams.phaseId).toBe('architecture');
    expect(body.designContext.history).toHaveLength(3);
    expect(body.messages[0].content).toMatch(/compute per communication/i);
    expect(screen.getByText('Live provider: test-provider')).toBeVisible();
  });

  it('retains the bounded calculation and optional AI review as phase-2 project evidence', async () => {
    window.history.replaceState({}, '', '/architectures?projectId=11111111-1111-4111-8111-111111111111');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ artifact: { sha256: 'abc123' } }),
    } as Response);
    globalThis.fetch = fetchMock as typeof fetch;

    render(<AcceleratorArchitectureLab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retain in project' }));

    await waitFor(() => expect(screen.getByText(/sha256:abc123/i)).toBeVisible());
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/workspace/artifacts');
    const body = JSON.parse(String(request.body));
    expect(body.projectId).toBe('11111111-1111-4111-8111-111111111111');
    expect(body.kind).toBe('evidence');
    expect(body.metadata).toMatchObject({
      lifecyclePhaseId: 'architecture',
      lifecyclePhaseOrder: 2,
      source: 'ai-accelerator-co-design-lab',
    });
    expect(JSON.parse(body.content).organizationComparison).toHaveLength(3);
  });
});
