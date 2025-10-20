'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Alert,
  LinearProgress,
  IconButton,
  Divider,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  AutoFixHigh as AutoIcon,
  CheckCircle as CheckIcon,
  TrendingUp as ImprovementIcon,
  Warning as WarningIcon,
  AutoAwesome as AIIcon,
} from '@mui/icons-material';
import { AlgorithmCategory } from '@/types/algorithms';
import {
  autoTuneParameters,
  AutoTuneResult,
  getConfidenceDescription,
  getRiskDescription,
} from '@/lib/autoTuning';

interface AutoTuneDialogProps {
  open: boolean;
  onClose: () => void;
  category: AlgorithmCategory;
  algorithm: string;
  currentParams: Record<string, any>;
  onApply: (params: Record<string, any>) => void;
}

export default function AutoTuneDialog({
  open,
  onClose,
  category,
  algorithm,
  currentParams,
  onApply,
}: AutoTuneDialogProps) {
  const tuneResult: AutoTuneResult = autoTuneParameters(category, algorithm, currentParams);

  const handleApply = () => {
    const newParams = { ...currentParams };
    tuneResult.recommendations.forEach((rec) => {
      newParams[rec.parameter] = rec.value;
    });
    onApply(newParams);
    onClose();
  };

  const getRiskColor = (risk: string): 'success' | 'warning' | 'error' => {
    switch (risk) {
      case 'low':
        return 'success';
      case 'medium':
        return 'warning';
      case 'high':
        return 'error';
      default:
        return 'warning';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoIcon color="primary" />
            <Typography variant="h6">AI Parameter Tuning</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Summary */}
        <Alert severity="info" sx={{ mb: 3 }} icon={<ImprovementIcon />}>
          <Typography variant="subtitle2" gutterBottom>
            Estimated Improvement
          </Typography>
          <Typography variant="body2">{tuneResult.estimatedImprovement}</Typography>
        </Alert>

        {/* Risk Level */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2">Risk Level</Typography>
            <Chip
              icon={<WarningIcon />}
              label={tuneResult.riskLevel.toUpperCase()}
              color={getRiskColor(tuneResult.riskLevel)}
              size="small"
            />
          </Box>
          <Typography variant="caption" color="text.secondary">
            {getRiskDescription(tuneResult.riskLevel)}
          </Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Recommendations */}
        {tuneResult.recommendations.length > 0 ? (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Recommended Changes
            </Typography>
            <List>
              {tuneResult.recommendations.map((rec, index) => (
                <ListItem key={index} disablePadding sx={{ mb: 2 }}>
                  <Box sx={{ width: '100%' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="body2" fontWeight="medium">
                        {rec.parameter}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          → {typeof rec.value === 'number' ? rec.value.toFixed(2) : rec.value}
                        </Typography>
                        <Chip
                          label={getConfidenceDescription(rec.confidence)}
                          size="small"
                          color={rec.confidence >= 0.8 ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {rec.reason}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={rec.confidence * 100}
                      sx={{ mt: 1, height: 4, borderRadius: 2 }}
                      color={rec.confidence >= 0.8 ? 'success' : 'primary'}
                    />
                  </Box>
                </ListItem>
              ))}
            </List>
          </>
        ) : (
          <Alert severity="info">
            No tuning recommendations available for this algorithm configuration.
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleApply}
          startIcon={<CheckIcon />}
          disabled={tuneResult.recommendations.length === 0}
        >
          Apply Recommendations
        </Button>
      </DialogActions>
    </Dialog>
  );
}
