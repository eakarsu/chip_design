import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import AICopilot, { CHAT_REQUEST_TIMEOUT_MS, GOVERNED_CHAT_PROMPTS } from '@/components/AICopilot';
import { CopilotPageContext, CopilotProvider } from '@/components/ai/CopilotProvider';
import { fitChatBounds } from '@/components/ai/FloatingChatWindow';
import ChatAnswer from '@/components/ai/ChatAnswer';
import { lightTheme } from '@/theme';
import AuthContext from '@/lib/auth/context';

let mockPathname = '/workspace';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
const originalFetch = global.fetch;
const testTheme = createTheme(lightTheme, { components: { MuiButtonBase: { defaultProps: { disableRipple: true } } } });
const reply = (content = 'Use the Design Workspace.', sources: unknown[] = []) =>
  ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      provider: 'Test provider',
      model: 'Test model',
      sources,
    }),
  }) as Response;
const wrapper = (props: React.ComponentProps<typeof AICopilot> = {}) => (
  <ThemeProvider theme={testTheme}>
    <CopilotProvider>
      <AICopilot {...props} />
    </CopilotProvider>
  </ThemeProvider>
);

beforeEach(() => {
  mockPathname = '/workspace';
  localStorage.clear();
});
afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
});

it('keeps a bounded deadline for longer engineering reviews', () => {
  expect(CHAT_REQUEST_TIMEOUT_MS).toBeGreaterThan(120_000);
  expect(CHAT_REQUEST_TIMEOUT_MS).toBeLessThan(300_000);
});

it('defaults to open-ended questions and makes preset design reviews optional', () => {
  render(wrapper({ embedded: true }));
  expect(screen.getByRole('tab', { name: 'Ask anything' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('Your question')).toBeVisible();
  expect(screen.queryByRole('button', { name: '28nm IoT SoC' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Phase 1:/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Engineering review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ideas' }));
  expect(GOVERNED_CHAT_PROMPTS).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: '16nm AI accelerator' }));
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toContain('2,048 MACs');
});

it('sends arbitrary questions, follows the current page and retains the conversation for follow-ups', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValue(
      reply('Open Workspace and choose ECO & approvals.', [{ title: 'Design Workspace', href: '/workspace' }])
    );
  global.fetch = fetchMock as typeof fetch;
  render(wrapper({ embedded: true }));
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: 'Where can I request approval for my ECO?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Open Workspace and choose ECO & approvals.');
  expect(screen.getByRole('link', { name: 'Design Workspace' })).toHaveAttribute('href', '/workspace');
  const first = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(first.mode).toBe('chat');
  expect(first.pageContext.pathname).toBe('/workspace');
  expect(first.designContext).toBeUndefined();
  expect(first.messages).toEqual([{ role: 'user', content: 'Where can I request approval for my ECO?' }]);
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Can I approve my own request?' } });
  fireEvent.keyDown(screen.getByLabelText('Your question'), { key: 'Enter' });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const followup = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(followup.messages).toHaveLength(3);
  expect(followup.messages[1].content).toContain('ECO & approvals');
  expect(followup.messages[2].content).toBe('Can I approve my own request?');
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
});

it('keeps complete-chip reviews at the preset requirements gate', async () => {
  const fetchMock = jest.fn().mockResolvedValue(reply('Review evidence before advancing.'));
  global.fetch = fetchMock as typeof fetch;
  render(wrapper({ embedded: true, initialMode: 'review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ideas' }));
  fireEvent.click(screen.getByRole('button', { name: '28nm IoT SoC' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Review evidence before advancing.');
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload.mode).toBe('review');
  expect(payload.designContext.currentParams.phaseId).toBe('requirements');
  expect(screen.getByRole('link', { name: 'Open this phase' })).toHaveAttribute(
    'href',
    '/governed-ai/lifecycle#phase-requirements'
  );
});

it('preserves the draft and allows using the app while a movable chat is open', () => {
  render(
    <>
      <button>Underlying app action</button>
      {wrapper()}
    </>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open AI chat' }));
  expect(screen.getByRole('dialog', { name: 'Ask NeuralChip' })).toHaveAttribute('aria-modal', 'false');
  expect(screen.getByRole('button', { name: 'Underlying app action' })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Explain my routing options' } });
  fireEvent.click(screen.getByRole('button', { name: 'Minimize AI chat' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open AI chat' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Open AI chat' }));
  expect(screen.getByLabelText('Your question')).toHaveValue('Explain my routing options');
});

it('moves and resizes with the keyboard, expands, and restores the saved position', () => {
  render(wrapper());
  fireEvent.click(screen.getByRole('button', { name: 'Open AI chat' }));
  const before = JSON.parse(localStorage.getItem('neuralchip-chat-layout-v1')!);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Move AI chat with arrow keys or drag' }), { key: 'ArrowLeft' });
  let after = JSON.parse(localStorage.getItem('neuralchip-chat-layout-v1')!);
  expect(after.x).toBe(before.x - 20);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Resize AI chat with arrow keys or drag' }), { key: 'ArrowUp' });
  after = JSON.parse(localStorage.getItem('neuralchip-chat-layout-v1')!);
  expect(after.height).toBe(before.height - 20);
  fireEvent.click(screen.getByRole('button', { name: 'Expand AI chat' }));
  expect(screen.queryByRole('button', { name: 'Resize AI chat with arrow keys or drag' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore chat size' }));
  expect(JSON.parse(localStorage.getItem('neuralchip-chat-layout-v1')!)).toEqual(after);
});

it.each([
  [390, 844],
  [320, 568],
  [844, 390],
  [360, 300],
])('keeps the chat reachable in a %i × %i viewport', (width, height) => {
  const bounds = fitChatBounds({ x: 1500, y: 900, width: 700, height: 800 }, width, height);
  expect(bounds.x).toBeGreaterThanOrEqual(12);
  expect(bounds.y).toBeGreaterThanOrEqual(12);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 12);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 12);
});

it('shares the same conversation between the floating panel and the full chat page', async () => {
  global.fetch = jest.fn().mockResolvedValue(reply('Compare the retained run metrics.')) as typeof fetch;
  const view = render(wrapper());
  fireEvent.click(screen.getByRole('button', { name: 'Open AI chat' }));
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'How do I compare runs?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Compare the retained run metrics.');
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'What if the PDK differs?' } });
  mockPathname = '/governed-ai/chat';
  view.rerender(wrapper({ embedded: true }));
  expect(screen.getByText('Compare the retained run metrics.')).toBeVisible();
  expect(screen.getByLabelText('Your question')).toHaveValue('What if the PDK differs?');
});

it('cancels an in-flight answer when clearing and ignores its late response', async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = jest.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      })
  );
  global.fetch = fetchMock as typeof fetch;
  render(wrapper({ embedded: true }));
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Explain the timing tools' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  expect(screen.getByRole('button', { name: 'Stop AI response' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear AI conversation' }));
  expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
  await act(async () => resolve(reply('This stale answer must not return.')));
  expect(screen.queryByText('This stale answer must not return.')).not.toBeInTheDocument();
  expect(screen.getByText('What would you like to know?')).toBeVisible();
});

it('preserves the question after a failed request so it can be retried', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: false, json: async () => ({ error: 'Provider unavailable' }) }) as typeof fetch;
  render(wrapper({ embedded: true }));
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Where is the academy?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable');
  expect(screen.getByLabelText('Your question')).toHaveValue('Where is the academy?');
});

it('attaches current tool results to one shared chat and releases them when leaving the tool page', async () => {
  const fetchMock = jest.fn().mockResolvedValue(reply());
  global.fetch = fetchMock as typeof fetch;
  const toolContext = { currentAlgorithm: 'placement', lastResult: { wirelength: 123 } };
  const content = (withTool: boolean) => (
    <ThemeProvider theme={testTheme}>
      <CopilotProvider>
        {withTool && <CopilotPageContext value={toolContext} />}
        <AICopilot />
      </CopilotProvider>
    </ThemeProvider>
  );
  const view = render(content(true));
  expect(screen.getAllByRole('button', { name: 'Open AI chat' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Open AI chat' }));
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Explain this placement result' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Use the Design Workspace.');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).designContext).toEqual(toolContext);
  mockPathname = '/learn';
  view.rerender(content(false));
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Where can I learn routing?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).designContext).toBeUndefined();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send question' })).toBeInTheDocument());
});

it('renders code without stripping comparisons and never turns unsafe URLs into links', () => {
  render(
    <ChatAnswer
      content={'```verilog\nassign y = (a < b) && (c > d);\n```\n[Bad](javascript:alert) [Workspace](/workspace)'}
    />
  );
  expect(document.querySelector('pre code')).toHaveTextContent('assign y = (a < b) && (c > d);');
  expect(screen.queryByRole('link', { name: 'Bad' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute('href', '/workspace');
});

it('keeps a large tool result within the request limit and marks omitted context explicitly', async () => {
  const fetchMock = jest.fn().mockResolvedValue(reply());
  global.fetch = fetchMock as typeof fetch;
  render(wrapper({ embedded: true, designContext: { lastResult: { coordinates: 'x'.repeat(150_000) } } }));
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Explain this result' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Use the Design Workspace.');
  const body = fetchMock.mock.calls[0][1].body;
  expect(body.length).toBeLessThan(120_000);
  const context = JSON.parse(body).designContext;
  expect(context.currentParams.contextTruncated).toBe(true);
  expect(context.lastResult.note).toContain('partial JSON excerpt');
});

it('preserves page context when initial authentication resolves and clears conversation on logout', async () => {
  const fetchMock = jest.fn().mockResolvedValue(reply());
  global.fetch = fetchMock as typeof fetch;
  const toolContext = { currentAlgorithm: 'routing', lastResult: { wirelength: 400 } };
  const user = {
    id: 'engineer',
    email: 'engineer@example.test',
    name: 'Engineer',
    role: 'editor' as const,
    emailVerified: true,
  };
  const authMethods = { login: jest.fn(), register: jest.fn(), logout: jest.fn(), updateUser: jest.fn() };
  const content = (isLoading: boolean, signedIn: boolean) => (
    <ThemeProvider theme={testTheme}>
      <AuthContext.Provider
        value={{ ...authMethods, isLoading, isAuthenticated: signedIn, user: signedIn ? user : null }}
      >
        <CopilotProvider>
          <CopilotPageContext value={toolContext} />
          <AICopilot embedded />
        </CopilotProvider>
      </AuthContext.Provider>
    </ThemeProvider>
  );
  const view = render(content(true, false));
  view.rerender(content(false, true));
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Explain the current routing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Use the Design Workspace.');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).designContext).toEqual(toolContext);
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Private follow-up' } });
  view.rerender(content(false, false));
  expect(screen.queryByText('Use the Design Workspace.')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Your question')).toHaveValue('');
});
