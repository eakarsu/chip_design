'use client';

import { useEffect, useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react';
import { Box, Fab, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import {
  ChatBubbleOutline,
  Close,
  DragIndicator,
  Fullscreen,
  FullscreenExit,
  OpenWith,
  RestartAlt,
} from '@mui/icons-material';

export type ChatBounds = { x: number; y: number; width: number; height: number };
const storageKey = 'neuralchip-chat-layout-v1';

export function fitChatBounds(bounds: ChatBounds, viewportWidth: number, viewportHeight: number): ChatBounds {
  const margin = 12;
  const width = Math.min(Math.max(340, bounds.width), Math.max(0, viewportWidth - margin * 2));
  const height = Math.min(Math.max(400, bounds.height), Math.max(0, viewportHeight - margin * 2));
  return {
    width,
    height,
    x: Math.max(margin, Math.min(bounds.x, viewportWidth - width - margin)),
    y: Math.max(margin, Math.min(bounds.y, viewportHeight - height - margin)),
  };
}

export default function FloatingChatWindow({
  children,
  hidden = false,
  title = 'Ask NeuralChip',
  openRequest = 0,
}: {
  children: ReactNode;
  hidden?: boolean;
  title?: string;
  openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openRequest > 0) setOpen(true); }, [openRequest]);
  const [maximized, setMaximized] = useState(false);
  const [bounds, setBounds] = useState<ChatBounds>({ x: 24, y: 24, width: 460, height: 640 });
  const [ready, setReady] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const drag = useRef<{ x: number; y: number; bounds: ChatBounds; resize: boolean } | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const size = () => ({ width: window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight });
  const reset = () => {
    const viewport = size();
    setMaximized(false);
    setBounds(
      fitChatBounds(
        { x: viewport.width - 484, y: viewport.height - 664, width: 460, height: 640 },
        viewport.width,
        viewport.height
      )
    );
  };

  useEffect(() => {
    const viewport = size();
    setViewportSize(viewport);
    let initial = { x: viewport.width - 484, y: viewport.height - 664, width: 460, height: 640 };
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (
        stored &&
        ['x', 'y', 'width', 'height'].every((key) => typeof stored[key] === 'number' && Number.isFinite(stored[key]))
      )
        initial = stored;
    } catch {
      /* A private browser may disable preference storage. */
    }
    setBounds(fitChatBounds(initial, viewport.width, viewport.height));
    setReady(true);
    const resize = () => {
      const viewport = size();
      setViewportSize(viewport);
      setBounds((current) => fitChatBounds(current, viewport.width, viewport.height));
    };
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(bounds));
      } catch {
        /* Optional preference. */
      }
    }
  }, [bounds, ready]);
  useEffect(() => {
    if (open && !hidden) panel.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    else if (!open && wasOpen.current) launcher.current?.focus();
    wasOpen.current = open;
  }, [open, hidden]);

  const close = () => setOpen(false);
  const start = (event: PointerEvent<HTMLElement>, resize = false) => {
    if (maximized || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, bounds, resize };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    const initial = drag.current;
    const dx = event.clientX - initial.x;
    const dy = event.clientY - initial.y;
    const viewport = size();
    setBounds(
      fitChatBounds(
        initial.resize
          ? {
              ...initial.bounds,
              width: Math.min(initial.bounds.width + dx, viewport.width - initial.bounds.x - 12),
              height: Math.min(initial.bounds.height + dy, viewport.height - initial.bounds.y - 12),
            }
          : { ...initial.bounds, x: initial.bounds.x + dx, y: initial.bounds.y + dy },
        viewport.width,
        viewport.height
      )
    );
  };
  const keyboard = (event: KeyboardEvent, resize = false) => {
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-20, 0],
      ArrowRight: [20, 0],
      ArrowUp: [0, -20],
      ArrowDown: [0, 20],
    };
    const delta = deltas[event.key];
    if (!delta || maximized) return;
    event.preventDefault();
    const viewport = size();
    setBounds((current) =>
      fitChatBounds(
        resize
          ? { ...current, width: current.width + delta[0], height: current.height + delta[1] }
          : { ...current, x: current.x + delta[0], y: current.y + delta[1] },
        viewport.width,
        viewport.height
      )
    );
  };

  return (
    <Box sx={{ display: hidden ? 'none' : undefined }}>
      <Fab
        ref={launcher}
        variant="extended"
        color="primary"
        aria-label="Open AI chat"
        aria-expanded={open}
        aria-controls="floating-ai-chat"
        onClick={() => setOpen((value) => !value)}
        sx={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: (theme) => theme.zIndex.drawer + 1,
          display: open ? 'none' : 'inline-flex',
          gap: 1,
          boxShadow: 6,
        }}
      >
        <ChatBubbleOutline />
        Ask AI
      </Fab>
      {open && !hidden && (
        <Paper
          ref={panel}
          id="floating-ai-chat"
          role="dialog"
          aria-modal="false"
          aria-label={title}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
          elevation={12}
          sx={{
            position: 'fixed',
            zIndex: (theme) => theme.zIndex.drawer + 2,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: 1,
            borderColor: 'divider',
            borderRadius: 3,
            ...(maximized
              ? { left: 12, top: 12, width: viewportSize.width - 24, height: viewportSize.height - 24 }
              : { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }),
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'calc(100dvh - 24px)',
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            sx={{ minHeight: 52, px: 1, bgcolor: 'primary.main', color: 'primary.contrastText' }}
          >
            <Box
              role="button"
              tabIndex={0}
              aria-label="Move AI chat with arrow keys or drag"
              onPointerDown={(event) => start(event)}
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onKeyDown={(event) => keyboard(event)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flex: 1,
                minWidth: 0,
                cursor: maximized ? 'default' : 'move',
                touchAction: 'none',
                userSelect: 'none',
              }}
            >
              <DragIndicator fontSize="small" />
              <Typography component="h2" noWrap fontWeight={800}>
                {title}
              </Typography>
            </Box>
            <Tooltip title="Reset position">
              <IconButton color="inherit" aria-label="Reset chat position" onClick={reset}>
                <RestartAlt fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={maximized ? 'Restore size' : 'Expand'}>
              <IconButton
                color="inherit"
                aria-label={maximized ? 'Restore chat size' : 'Expand AI chat'}
                onClick={() => setMaximized((value) => !value)}
              >
                {maximized ? <FullscreenExit /> : <Fullscreen />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Minimize">
              <IconButton color="inherit" aria-label="Minimize AI chat" onClick={close}>
                <Close />
              </IconButton>
            </Tooltip>
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</Box>
          {!maximized && (
            <IconButton
              size="small"
              aria-label="Resize AI chat with arrow keys or drag"
              onPointerDown={(event) => start(event, true)}
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onKeyDown={(event) => keyboard(event, true)}
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                cursor: 'nwse-resize',
                touchAction: 'none',
                opacity: 0.6,
              }}
            >
              <OpenWith sx={{ fontSize: 15 }} />
            </IconButton>
          )}
        </Paper>
      )}
    </Box>
  );
}
