import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import AICopilot, { CHAT_REQUEST_TIMEOUT_MS, GOVERNED_CHAT_PROMPTS } from '@/components/AICopilot';
import { lightTheme } from '@/theme';

describe('AICopilot', () => {
  it('allows the configured review model to run beyond the old two-minute cutoff', () => {
    expect(CHAT_REQUEST_TIMEOUT_MS).toBeGreaterThan(120_000);
    expect(CHAT_REQUEST_TIMEOUT_MS).toBeLessThan(300_000);
  });

  it('renders an embedded governed chat with multiple editable quick prompts', () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <AICopilot embedded title="Governed chip-design chat" />
      </ThemeProvider>,
    );

    expect(screen.getByText('Governed chip-design chat')).toBeInTheDocument();
    expect(GOVERNED_CHAT_PROMPTS).toHaveLength(6);
    expect(GOVERNED_CHAT_PROMPTS.every(prompt => prompt.phaseId === 'requirements')).toBe(true);
    for (const prompt of GOVERNED_CHAT_PROMPTS) {
      expect(screen.getByRole('button', { name: prompt.label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '28nm IoT SoC' }).compareDocumentPosition(screen.getByText('Copilot guidance')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '16nm AI accelerator' }));
    expect(screen.getByPlaceholderText<HTMLInputElement>('Ask me anything about chip design...').value)
      .toContain('2,048 MACs');
    expect(screen.getByRole('button', { name: 'Run AI Review' })).toBeEnabled();
  });

  it('shows the executable chip-completion path after a user sends a request', () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as unknown as jest.MockedFunction<typeof fetch>;
    render(
      <ThemeProvider theme={lightTheme}>
        <AICopilot embedded title="Governed chip-design chat" />
      </ThemeProvider>,
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>('Ask me anything about chip design...');
    fireEvent.change(input, { target: { value: 'Help me resolve placement congestion' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('PATH TO COMPLETE THE CHIP')).toBeInTheDocument();
    expect(screen.getByText(/You are at phase 8: Placement & optimization/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open this phase' })).toHaveAttribute('href', '/governed-ai/lifecycle#phase-placement');
    expect(screen.getByRole('link', { name: 'Implementation flow' })).toHaveAttribute('href', '/flow');
    expect(screen.getByRole('link', { name: 'Next phase' })).toHaveAttribute('href', '/governed-ai/lifecycle#phase-cts');
    if (originalFetch) global.fetch = originalFetch;
    else Reflect.deleteProperty(global, 'fetch');
  });

  it('keeps a complete-chip preset at its declared phase-one entry gate', () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as unknown as jest.MockedFunction<typeof fetch>;
    render(
      <ThemeProvider theme={lightTheme}>
        <AICopilot embedded title="Governed chip-design chat" />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '28nm IoT SoC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run AI Review' }));

    expect(screen.getByText(/You are at phase 1: Product requirements & acceptance criteria/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open this phase' })).toHaveAttribute('href', '/governed-ai/lifecycle#phase-requirements');
    expect(screen.queryByText(/You are at phase 14:/)).not.toBeInTheDocument();

    if (originalFetch) global.fetch = originalFetch;
    else Reflect.deleteProperty(global, 'fetch');
  });

  it('shows a live request state and identifies the AI provider and model from the response', async () => {
    const originalFetch = global.fetch;
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });

    global.fetch = jest.fn(async () => {
      await responseGate;
      return {
        ok: true,
        json: async () => ({
          id: 'gen-local-proof',
          model: 'openai/gpt-oss-120b',
          provider: 'Groq',
          choices: [{ message: { content: 'Measured evidence is required.' } }],
        }),
      } as Response;
    }) as unknown as jest.MockedFunction<typeof fetch>;

    render(
      <ThemeProvider theme={lightTheme}>
        <AICopilot embedded title="Governed chip-design chat" />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '28nm IoT SoC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run AI Review' }));

    expect(screen.getByRole('status')).toHaveTextContent('OpenRouter request in progress');
    expect(screen.getByRole('button', { name: 'AI is reviewing…' })).toBeDisabled();

    releaseResponse?.();
    await waitFor(() => expect(screen.getByText('Live provider: Groq')).toBeInTheDocument());
    expect(screen.getByText('Model: openai/gpt-oss-120b')).toBeInTheDocument();
    expect(screen.getByText('Measured evidence is required.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run AI Review' })).toBeDisabled());

    if (originalFetch) global.fetch = originalFetch;
    else Reflect.deleteProperty(global, 'fetch');
  });
});
