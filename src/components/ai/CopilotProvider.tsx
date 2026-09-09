'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import AuthContext from '@/lib/auth/context';
import type { CopilotSource } from '@/lib/ai/copilotKnowledge';
import type { ProjectAttachmentSelection } from '@/lib/journey/types';

export const CHAT_REQUEST_TIMEOUT_MS = 285_000;
export type ChatMode = 'chat' | 'review';
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
}

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

function useChatSession() {
  const auth = useContext(AuthContext);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('chat');
  const [activePhaseId, setActivePhaseId] = useState('requirements');
  const [reviewContext, setReviewContext] = useState<DesignContext | undefined>();
  const [pageDesignContext, setPageDesignContext] = useState<DesignContext | undefined>();
  const [projectAttachment, setProjectAttachment] = useState<ProjectAttachmentSelection | undefined>();
  const [openRequest, setOpenRequest] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const identity = auth?.isLoading ? undefined : (auth?.user?.id ?? 'guest');
  const previousIdentity = useRef(identity);

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
    if (!hadIdentity) return;
    active.current?.abort();
    active.current = null;
    setMessages([]);
    setInput('');
    setError('');
    setLoading(false);
    setMode('chat');
    setActivePhaseId('requirements');
    setReviewContext(undefined);
    setPageDesignContext(undefined);
    setProjectAttachment(undefined);
  }, [identity]);

  const send = async (context: { pathname: string; designContext?: DesignContext; mode: ChatMode }) => {
    const content = input.trim();
    if (!content || active.current) return;
    const controller = new AbortController();
    if (context.mode === 'review') setReviewContext(context.designContext);
    active.current = controller;
    const userMessage: ChatMessage = { role: 'user', content, mode: context.mode, timestamp: new Date().toISOString() };
    const history = [...messages, userMessage]
      .slice(-40)
      .map(({ role, content }) => ({ role, content: content.slice(0, 20_000) }));
    while (history.length > 1 && JSON.stringify(history).length > 60_000) history.shift();
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setLoading(true);
    setError('');
    const timer = window.setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history,
          mode: context.mode,
          pageContext: { pathname: context.pathname },
          designContext: boundedDesignContext(context.designContext),
          projectAttachment,
          stream: false,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? `Chat request failed (${response.status})`);
      const answer = data.choices?.[0]?.message?.content?.trim();
      if (!answer) throw new Error('The AI returned an empty answer. Please retry.');
      if (active.current !== controller) return;
      const sources = Array.isArray(data.sources)
        ? data.sources
            .filter((source: CopilotSource) => typeof source.href === 'string' && /^\/(?!\/)/.test(source.href))
            .slice(0, 8)
        : [];
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: answer,
          mode: context.mode,
          timestamp: new Date().toISOString(),
          provider: data.provider,
          model: data.model,
          sources,
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
        setInput((current) => current || content);
      }
    } finally {
      window.clearTimeout(timer);
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
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
    openRequest,
    openChat: () => setOpenRequest(value => value + 1),
    loading,
    error,
    send,
    stop,
    clear,
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
