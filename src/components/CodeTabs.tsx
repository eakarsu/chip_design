'use client';

import { Box, Tabs, Tab, Paper, IconButton, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';

export interface CodeExample {
  language: string;
  label: string;
  code: string;
}

interface CodeTabsProps {
  examples: CodeExample[];
}

export default function CodeTabs({ examples }: CodeTabsProps) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(examples[activeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.02)' : 'rgba(129, 140, 248, 0.04)',
        }}
      >
        <Tabs
          value={activeTab ?? 0}
          onChange={(_, newValue) => setActiveTab(newValue as number)}
          sx={{
            minHeight: 48,
            '& .MuiTab-root': {
              minHeight: 48,
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
            },
          }}
        >
          {examples.map((example, index) => (
            <Tab key={index} label={example.label} />
          ))}
        </Tabs>

        <Tooltip title={copied ? 'Copied!' : 'Copy code'}>
          <IconButton onClick={handleCopy} size="small" sx={{ mr: 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              {copied ? 'check' : 'content_copy'}
            </span>
          </IconButton>
        </Tooltip>
      </Box>

      <Box
        component="pre"
        sx={{
          p: 3,
          m: 0,
          overflow: 'auto',
          bgcolor: theme.palette.mode === 'light' ? '#F8FAFC' : '#0F172A',
          fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
          fontSize: '0.875rem',
          lineHeight: 1.7,
        }}
      >
        <code>{examples[activeTab].code}</code>
      </Box>
    </Paper>
  );
}
