'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  CircularProgress,
  Alert,
  LinearProgress,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  AutoAwesome as AIIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { AlgorithmCategory } from '@/types/algorithms';

interface AlgorithmRecommendation {
  category: AlgorithmCategory;
  algorithm: string;
  confidence: number;
  reasoning: string;
}

interface AIAlgorithmSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (category: AlgorithmCategory, algorithm: string) => void;
}

export default function AIAlgorithmSelector({
  open,
  onClose,
  onSelect,
}: AIAlgorithmSelectorProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<AlgorithmRecommendation[]>([]);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setRecommendations([]);
    setSummary('');

    try {
      const response = await fetch('/api/ai/select-algorithm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI recommendations');
      }

      const data = await response.json();
      setRecommendations(data.recommendations || []);
      setSummary(data.summary || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRecommendation = (rec: AlgorithmRecommendation) => {
    onSelect(rec.category, rec.algorithm);
    onClose();
    setQuery('');
    setRecommendations([]);
    setSummary('');
  };

  const getConfidenceColor = (confidence: number): 'success' | 'warning' | 'error' => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'error';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AIIcon color="primary" />
            <Typography variant="h6">AI Algorithm Selection</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Input */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Describe what you want to do:
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            placeholder="E.g., I need to place 50 cells on a chip with minimal wirelength..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                handleSearch();
              }
            }}
            disabled={loading}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Examples: "optimize power consumption", "route wires efficiently", "partition large circuit"
          </Typography>
        </Box>

        <Button
          fullWidth
          variant="contained"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          startIcon={loading ? <CircularProgress size={20} /> : <AIIcon />}
          sx={{ mb: 3 }}
        >
          {loading ? 'Analyzing...' : 'Get AI Recommendations'}
        </Button>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Summary */}
        {summary && (
          <Alert severity="info" sx={{ mb: 2 }} icon={<AIIcon />}>
            <Typography variant="subtitle2" gutterBottom>
              AI Analysis
            </Typography>
            <Typography variant="body2">{summary}</Typography>
          </Alert>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Recommended Algorithms
            </Typography>
            <List>
              {recommendations.map((rec, index) => (
                <ListItem key={index} disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    onClick={() => handleSelectRecommendation(rec)}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      '&:hover': {
                        borderColor: 'primary.main',
                        bgcolor: 'primary.50',
                      },
                    }}
                  >
                    <Box sx={{ width: '100%' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Chip
                            label={rec.category.replace('_', ' ').toUpperCase()}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          <Typography variant="subtitle1" fontWeight="medium">
                            {rec.algorithm.replace('_', ' ')}
                          </Typography>
                        </Box>
                        <Chip
                          label={`${(rec.confidence * 100).toFixed(0)}% confidence`}
                          size="small"
                          color={getConfidenceColor(rec.confidence)}
                        />
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {rec.reasoning}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={rec.confidence * 100}
                        sx={{ mt: 1, height: 4, borderRadius: 2 }}
                        color={getConfidenceColor(rec.confidence)}
                      />
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
