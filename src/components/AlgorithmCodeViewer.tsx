'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Tabs,
  Tab,
  Typography,
  IconButton,
  Alert,
} from '@mui/material';
import { Close as CloseIcon, ContentCopy as CopyIcon } from '@mui/icons-material';
import { algorithmCodeExamples, CodeExample } from '@/lib/algorithmCodeExamples';
import { AlgorithmCategory } from '@/types/algorithms';

interface AlgorithmCodeViewerProps {
  open: boolean;
  onClose: () => void;
  category: AlgorithmCategory;
  algorithm: string;
}

export default function AlgorithmCodeViewer({
  open,
  onClose,
  category,
  algorithm,
}: AlgorithmCodeViewerProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const codeExample = algorithmCodeExamples[category]?.[algorithm];

  if (!codeExample) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          Code Examples
          <IconButton
            onClick={onClose}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info">
            Code examples for this algorithm are coming soon. In the meantime,
            you can explore the similar algorithms in this category.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  const handleCopy = () => {
    const currentExample = codeExample.examples[activeTab];
    if (currentExample) {
      navigator.clipboard.writeText(currentExample.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getLanguageLabel = (lang: CodeExample['language']) => {
    switch (lang) {
      case 'typescript':
        return 'TypeScript';
      case 'python':
        return 'Python';
      case 'curl':
        return 'cURL (REST API)';
      default:
        return lang;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" component="div">
              {codeExample.algorithm}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {codeExample.description}
            </Typography>
          </Box>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            {codeExample.examples.map((example, index) => (
              <Tab key={index} label={getLanguageLabel(example.language)} />
            ))}
          </Tabs>
        </Box>

        <Box sx={{ position: 'relative' }}>
          <IconButton
            onClick={handleCopy}
            sx={{
              position: 'absolute',
              right: 16,
              top: 16,
              zIndex: 1,
              bgcolor: 'background.paper',
              '&:hover': { bgcolor: 'action.hover' },
            }}
            size="small"
          >
            <CopyIcon fontSize="small" />
          </IconButton>

          {codeExample.examples.map((example, index) => (
            <Box
              key={index}
              role="tabpanel"
              hidden={activeTab !== index}
              sx={{ p: 3 }}
            >
              {activeTab === index && (
                <Box
                  component="pre"
                  sx={{
                    bgcolor: 'grey.900',
                    color: 'grey.100',
                    p: 2,
                    borderRadius: 1,
                    overflow: 'auto',
                    fontSize: '0.875rem',
                    fontFamily: 'monospace',
                    m: 0,
                  }}
                >
                  {example.code}
                </Box>
              )}
            </Box>
          ))}

          {copied && (
            <Box
              sx={{
                position: 'absolute',
                top: 16,
                right: 60,
                bgcolor: 'success.main',
                color: 'success.contrastText',
                px: 2,
                py: 0.5,
                borderRadius: 1,
                fontSize: '0.875rem',
              }}
            >
              Copied!
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
        <Button
          onClick={handleCopy}
          variant="contained"
          startIcon={<CopyIcon />}
        >
          Copy Code
        </Button>
      </DialogActions>
    </Dialog>
  );
}
