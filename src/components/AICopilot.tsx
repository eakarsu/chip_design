'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  Fab,
  Drawer,
  AppBar,
  Toolbar,
  List,
  ListItem,
  Divider,
  Chip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AICopilotProps {
  designContext?: {
    currentAlgorithm?: string;
    currentParams?: Record<string, unknown>;
    lastResult?: unknown;
    history?: unknown[];
  };
}

export default function AICopilot({ designContext }: AICopilotProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I\'m your AI chip design assistant. I can help you select algorithms, tune parameters, explain results, and guide you through complete design flows. What would you like to work on?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages
            .concat(userMessage)
            .map((m) => ({ role: m.role, content: m.content })),
          designContext,
          stream: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantContent = '';
      const decoder = new TextDecoder();

      // Add empty assistant message
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '', timestamp: new Date() },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].content = assistantContent;
                  return newMessages;
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Copilot error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'Conversation cleared. How can I help you with chip design?',
        timestamp: new Date(),
      },
    ]);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  return (
    <>
      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="AI Copilot"
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
        }}
        onClick={() => setOpen(true)}
      >
        <SmartToyIcon />
      </Fab>

      {/* Drawer */}
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: { xs: '100%', sm: 480 },
          },
        }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <AppBar position="static" elevation={0}>
            <Toolbar>
              <SmartToyIcon sx={{ mr: 2 }} />
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                AI Copilot
              </Typography>
              <IconButton color="inherit" onClick={handleClear}>
                <DeleteIcon />
              </IconButton>
              <IconButton color="inherit" onClick={() => setOpen(false)}>
                <CloseIcon />
              </IconButton>
            </Toolbar>
          </AppBar>

          {/* Context Info */}
          {designContext && (
            <Box sx={{ p: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Current Context
              </Typography>
              {designContext.currentAlgorithm && (
                <Chip
                  label={designContext.currentAlgorithm}
                  size="small"
                  sx={{ mr: 1, mb: 1 }}
                />
              )}
              {designContext.currentParams && (
                <Chip
                  label={`${Object.keys(designContext.currentParams).length} params`}
                  size="small"
                  variant="outlined"
                  sx={{ mb: 1 }}
                />
              )}
            </Box>
          )}

          {/* Messages */}
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
            <List>
              {messages.map((message, index) => (
                <ListItem
                  key={index}
                  sx={{
                    flexDirection: 'column',
                    alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                    mb: 2,
                  }}
                >
                  <Paper
                    elevation={1}
                    sx={{
                      p: 2,
                      maxWidth: '85%',
                      bgcolor: message.role === 'user' ? 'primary.main' : 'background.paper',
                      color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                    >
                      {message.content}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>
                        {message.timestamp.toLocaleTimeString()}
                      </Typography>
                      {message.role === 'assistant' && (
                        <IconButton
                          size="small"
                          onClick={() => handleCopy(message.content)}
                          sx={{ ml: 1 }}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  </Paper>
                </ListItem>
              ))}
              {loading && (
                <ListItem sx={{ justifyContent: 'center' }}>
                  <CircularProgress size={24} />
                </ListItem>
              )}
              <div ref={messagesEndRef} />
            </List>
          </Box>

          <Divider />

          {/* Input */}
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                fullWidth
                multiline
                maxRows={4}
                placeholder="Ask me anything about chip design..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={loading}
              />
              <IconButton
                color="primary"
                onClick={handleSend}
                disabled={!input.trim() || loading}
              >
                <SendIcon />
              </IconButton>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Press Enter to send, Shift+Enter for new line
            </Typography>
          </Box>
        </Box>
      </Drawer>
    </>
  );
}
