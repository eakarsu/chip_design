'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import AuthContext from '@/lib/auth/context';
import type { CopilotSource } from '@/lib/ai/copilotKnowledge';
import type { ProjectAttachmentSelection } from '@/lib/journey/types';

export const CHAT_REQUEST_TIMEOUT_MS = 285_000;
export type ChatMode = 'chat' | 'review';
export type ChatFeedback = 'up' | 'down';
export type DesignContext = {
  currentAlgorithm?: string;
  currentParams?: Record<string, unknown>;
  lastResult?: unknown;
  history?: unknown[];
};
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  mode: ChatMode;
  timestamp: string;
  provider?: string;
  model?: string;
  sources?: CopilotSource[];
  followUps?: string[];
  durationMs?: number;
  contextChars?: number;
  contextTruncated?: boolean;
  pinned?: boolean;
  feedback?: ChatFeedback;
}
export interface ChatRequestContext {
  pathname: string;
  designContext?: DesignContext;
  mode: ChatMode;
}

const storagePrefix = 'neuralchip-chat-history-v1';
const storageKeyFor = (identity: string) => `${storagePrefix}:${identity}`;

function boundedDesignContext(context: DesignContext | undefined): DesignContext | undefined {
  if (!context) return undefined;
  const serialized = JSON.stringify(context);
  if (serialized.length <= 40_000) return context;
  return {
    currentAlgorithm: context.currentAlgorithm?.slice(0, 1_000),
    currentParams: { contextTruncated: true, originalCharacters: serialized.length },
    lastResult: {
      note: 'This is a partial JSON excerpt of a large tool context. Ask for any missing metrics needed to answer.',
      jsonExcerpt: serialized.slice(0, 20_000),
    },
  };
}

function contextSizeOf(context: DesignContext | undefined): number {
  if (!context) return 0;
  try {
    return JSON.stringify(context).length;
  } catch {
    return 0;
  }
}

/** Strip the model-generated `FOLLOWUPS:` trailer into clickable suggestions. */
export function splitFollowUps(content: string): { content: string; followUps: string[] } {
  const match = content.match(/\n?\s*FOLLOWUPS:\s*([^\n]*)\s*$/i);
  if (!match) return { content: content.trim(), followUps: [] };
  const followUps = match[1]
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  return { content: content.slice(0, match.index).trim(), followUps };
}

function validSource(source: CopilotSource): boolean {
  return typeof source?.href === 'string' && /^\/(?!\/)/.test(source.href) && typeof source.title === 'string';
}

function sourcesFrom(value: unknown): CopilotSource[] {
  return Array.isArray(value) ? value.filter(validSource).slice(0, 8) : [];
}

function decodeSourcesHeader(encoded: string | null | undefined): CopilotSource[] {
  if (!encoded || typeof atob !== 'function') return [];
  try {
    return sourcesFrom(JSON.parse(atob(encoded)));
  } catch {
    return [];
  }
}

function loadStoredMessages(identity: string): ChatMessage[] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKeyFor(identity)) ?? 'null') as {
      messages?: unknown;
    } | null;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    const messages = parsed.messages.filter((item): item is ChatMessage => {
      const candidate = item as Partial<ChatMessage>;
      return (
        candidate !== null &&
        typeof candidate === 'object' &&
        (candidate.role === 'user' || candidate.role === 'assistant') &&
        typeof candidate.content === 'string' &&
        (candidate.mode === 'chat' || candidate.mode === 'review')
      );
    });
    return messages.slice(-60);
  } catch {
    return null;
  }
}

function saveStoredMessages(identity: string, messages: ChatMessage[]): void {
  try {
    const bounded = messages
      .filter((message) => message.content.trim())
      .slice(-60)
      .map((message) => ({ ...message, content: message.content.slice(0, 20_000) }));
    localStorage.setItem(storageKeyFor(identity), JSON.stringify({ messages: bounded }));
  } catch {
    /* A private browser may disable preference storage. */
  }
}

function useChatSession() {
  const auth = useContext(AuthContext);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('chat');
  const [activePhaseId, setActivePhaseId] = useState('requirements');
  const [reviewContext, setReviewContext] = useState<DesignContext | undefined>();
  const [pageDesignContext, setPageDesignContext] = useState<DesignContext | undefined>();
  const [projectAttachment, setProjectAttachment] = useState<ProjectAttachmentSelection | undefined>();
  const [selectedModel, setSelectedModel] = useState('');
  const [openRequest, setOpenRequest] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const requestContext = useRef<ChatRequestContext | null>(null);
  const identity = auth?.isLoading ? undefined : (auth?.user?.id ?? 'guest');
  const previousIdentity = useRef<string | undefined>(undefined);

  const stop = () => {
    active.current?.abort();
    active.current = null;
    setLoading(false);
  };
  const clear = () => {
    stop();
    setMessages([]);
    setInput('');
    setError('');
    setReviewContext(undefined);
    setActivePhaseId('requirements');
    if (identity) {
      try {
        localStorage.removeItem(storageKeyFor(identity));
      } catch {
        /* Optional preference. */
      }
    }
  };

  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    []
  );
  useEffect(() => {
    if (identity === undefined || previousIdentity.current === identity) return;
    const hadIdentity = previousIdentity.current !== undefined;
    previousIdentity.current = identity;
    if (!hadIdentity) {
      const stored = loadStoredMessages(identity);
      if (stored) setMessages(stored);
      return;
    }
    active.current?.abort();
    active.current = null;
    setLoading(false);
    setInput('');
    setError('');
    setReviewContext(undefined);
    setPageDesignContext(undefined);
    setProjectAttachment(undefined);
    setMode('chat');
    setActivePhaseId('requirements');
    setMessages(loadStoredMessages(identity) ?? []);
  }, [identity]);
  useEffect(() => {
    if (identity === undefined) return;
    const timer = window.setTimeout(() => saveStoredMessages(identity, messages), 400);
    return () => window.clearTimeout(timer);
  }, [messages, identity]);

  const applyToLastAssistant = (updater: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => {
      const index = current.length - 1;
      if (index < 0 || current[index].role !== 'assistant') return current;
      const next = current.slice();
      next[index] = updater(current[index]);
      return next;
    });
  };

  const consumeStream = async (
    response: Response,
    context: ChatRequestContext,
    meta: { startedAt: number; contextChars: number; contextTruncated: boolean }
  ) => {
    const sources = decodeSourcesHeader(response.headers?.get?.('x-copilot-sources'));
    let provider: string | undefined;
    let model = response.headers?.get?.('x-copilot-model') ?? undefined;
    let content = '';
    setMessages((current) => [
      ...current,
      { role: 'assistant', content: '', mode: context.mode, timestamp: new Date().toISOString(), model },
    ]);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload) as {
              provider?: string;
              model?: string;
              choices?: Array<{ delta?: { content?: string } }>;
            };
            if (chunk.provider) provider = chunk.provider;
            if (chunk.model) model = chunk.model;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              content += delta;
              applyToLastAssistant((message) => ({ ...message, content }));
            }
          } catch {
            /* Ignore keep-alives and non-JSON provider lines. */
          }
        }
      }
    }
    const { content: answer, followUps } = splitFollowUps(content);
    if (!answer) {
      setMessages((current) => current.filter((message) => message.content.trim() || message.role === 'user'));
      throw new Error('The AI returned an empty answer. Please retry.');
    }
    applyToLastAssistant((message) => ({
      ...message,
      content: answer,
      provider,
      model,
      sources: sources.length ? sources : undefined,
      followUps: followUps.length ? followUps : undefined,
      durationMs: Date.now() - meta.startedAt,
      contextChars: meta.contextChars,
      contextTruncated: meta.contextTruncated,
    }));
  };

  const dispatch = async (content: string, context: ChatRequestContext, baseMessages?: ChatMessage[]) => {
    const text = content.trim();
    if (!text || active.current) return;
    const controller = new AbortController();
    requestContext.current = context;
    if (context.mode === 'review') setReviewContext(context.designContext);
    active.current = controller;
    const userMessage: ChatMessage = { role: 'user', content: text, mode: context.mode, timestamp: new Date().toISOString() };
    const base = baseMessages ?? messages;
    const history = [...base, userMessage]
      .slice(-40)
      .map(({ role, content: messageContent }) => ({ role, content: messageContent.slice(0, 20_000) }));
    while (history.length > 1 && JSON.stringify(history).length > 60_000) history.shift();
    setMessages([...base, userMessage]);
    setInput('');
    setLoading(true);
    setError('');
    const startedAt = Date.now();
    const contextChars = contextSizeOf(context.designContext);
    const contextTruncated = contextChars > 40_000;
    const timer = window.setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history,
          mode: context.mode,
          ...(selectedModel ? { model: selectedModel } : {}),
          pageContext: { pathname: context.pathname },
          designContext: boundedDesignContext(context.designContext),
          projectAttachment,
          stream: context.mode === 'chat',
        }),
      });
      const contentType = response.headers?.get?.('content-type') ?? '';
      if (response.ok && contentType.includes('text/event-stream') && response.body) {
        await consumeStream(response, context, { startedAt, contextChars, contextTruncated });
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? `Chat request failed (${response.status})`);
      const rawAnswer = data.choices?.[0]?.message?.content?.trim();
      if (!rawAnswer) throw new Error('The AI returned an empty answer. Please retry.');
      if (active.current !== controller) return;
      const { content: answer, followUps } = splitFollowUps(rawAnswer);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: answer,
          mode: context.mode,
          timestamp: new Date().toISOString(),
          provider: data.provider,
          model: data.model,
          sources: sourcesFrom(data.sources),
          followUps: followUps.length ? followUps : undefined,
          durationMs: Date.now() - startedAt,
          contextChars,
          contextTruncated,
        },
      ]);
    } catch (reason) {
      if (active.current === controller) {
        setError(
          controller.signal.aborted
            ? 'The answer took too long. Try again or narrow the question.'
            : reason instanceof Error
              ? reason.message
              : 'The chat request failed. Please retry.'
        );
        setInput((current) => current || text);
      }
    } finally {
      window.clearTimeout(timer);
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
    }
  };

  const send = (context: ChatRequestContext) => dispatch(input, context);

  /** Re-ask the most recent user question, replacing its previous answer. */
  const regenerate = () => {
    if (active.current) return;
    let lastUserIndex = -1;
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].role === 'user') {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex < 0 || !requestContext.current) return;
    void dispatch(messages[lastUserIndex].content, requestContext.current, messages.slice(0, lastUserIndex));
  };

  /** Retry a question whose request failed (last message is still the user). */
  const retry = () => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || active.current) return;
    const fallback: ChatRequestContext = requestContext.current ?? {
      pathname: typeof window === 'undefined' ? '/' : window.location.pathname,
      mode: last.mode,
    };
    void dispatch(last.content, fallback, messages.slice(0, -1));
  };

  /** Load an earlier question into the composer and drop it and later turns. */
  const editMessage = (index: number) => {
    const message = messages[index];
    if (!message || message.role !== 'user' || active.current) return;
    setMessages(messages.slice(0, index));
    setInput(message.content);
    setError('');
  };

  const setPinned = (index: number, pinned: boolean) => {
    setMessages((current) =>
      current.map((message, messageIndex) => (messageIndex === index ? { ...message, pinned } : message))
    );
  };

  const rate = async (index: number, rating: ChatFeedback) => {
    const message = messages[index];
    if (!message || message.role !== 'assistant') return;
    setMessages((current) =>
      current.map((item, messageIndex) => (messageIndex === index ? { ...item, feedback: rating } : item))
    );
    const question =
      [...messages.slice(0, index)].reverse().find((item) => item.role === 'user')?.content ?? '';
    try {
      await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          mode: message.mode,
          model: message.model,
          provider: message.provider,
          page: requestContext.current?.pathname,
          question,
          answer: message.content,
        }),
      });
    } catch {
      /* The local rating remains even if the rollup write fails. */
    }
  };

  return {
    messages,
    input,
    setInput,
    mode,
    setMode,
    activePhaseId,
    setActivePhaseId,
    reviewContext,
    pageDesignContext,
    setPageDesignContext,
    projectAttachment,
    setProjectAttachment,
    selectedModel,
    setSelectedModel,
    openRequest,
    openChat: () => setOpenRequest(value => value + 1),
    loading,
    error,
    send,
    stop,
    clear,
    regenerate,
    retry,
    editMessage,
    setPinned,
    rate,
  };
}

export const CopilotContext = createContext<ReturnType<typeof useChatSession> | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  return <CopilotContext.Provider value={useChatSession()}>{children}</CopilotContext.Provider>;
}

export function useCopilot() {
  const chat = useContext(CopilotContext);
  if (!chat) throw new Error('CopilotProvider is required');
  return chat;
}

/** Supplies live tool inputs/results to the single app-wide chat while this page is mounted. */
export function CopilotPageContext({ value }: { value: DesignContext }) {
  const { setPageDesignContext } = useCopilot();
  useEffect(() => {
    setPageDesignContext(value);
    return () => setPageDesignContext(undefined);
  }, [value, setPageDesignContext]);
  return null;
}

/** Only explicitly selected project evidence is attached to provider requests. */
export function CopilotProjectContext({ selection }: { selection: ProjectAttachmentSelection | undefined }) {
  const { setProjectAttachment } = useCopilot();
  useEffect(() => {
    setProjectAttachment(selection);
    return () => setProjectAttachment(undefined);
  }, [selection, setProjectAttachment]);
  return null;
}
