'use client';

import React, { useState } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  CardActions,
  Divider,
  Alert,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';

interface FlowStep {
  step: number;
  category: string;
  algorithm: string;
  parameters: Record<string, any>;
  reason: string;
  estimatedTime: string;
  dependencies: number[];
}

interface DesignFlow {
  name: string;
  description: string;
  totalSteps: number;
  estimatedDuration: string;
  steps: FlowStep[];
}

interface DesignFlowGeneratorProps {
  onExecuteFlow?: (flow: DesignFlow) => void;
}

export default function DesignFlowGenerator({ onExecuteFlow }: DesignFlowGeneratorProps) {
  const [requirements, setRequirements] = useState('');
  const [chipType, setChipType] = useState('');
  const [gateCount, setGateCount] = useState('');
  const [powerBudget, setPowerBudget] = useState('');
  const [frequency, setFrequency] = useState('');
  const [priority, setPriority] = useState('balanced');
  const [loading, setLoading] = useState(false);
  const [flow, setFlow] = useState<DesignFlow | null>(null);
  const [alternatives, setAlternatives] = useState<DesignFlow[]>([]);
  const [showAlternatives, setShowAlternatives] = useState(false);

  const handleGenerate = async (withAlternatives: boolean = false) => {
    if (!requirements.trim()) return;

    setLoading(true);
    setFlow(null);
    setAlternatives([]);

    try {
      const response = await fetch('/api/ai/generate-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirements,
          designSpecs: {
            chipType: chipType || undefined,
            gateCount: gateCount ? parseInt(gateCount) : undefined,
            powerBudget: powerBudget ? parseFloat(powerBudget) : undefined,
            frequency: frequency ? parseFloat(frequency) : undefined,
            priority,
          },
          generateAlternatives: withAlternatives,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate flow');

      const data = await response.json();
      setFlow(data.flow);
      if (data.alternatives) {
        setAlternatives(data.alternatives);
      }
      setShowAlternatives(withAlternatives);
    } catch (error) {
      console.error('Flow generation error:', error);
      alert('Failed to generate design flow. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderFlowCard = (flowData: DesignFlow, title?: string) => (
    <Card elevation={3}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title || flowData.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          {flowData.description}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Chip label={`${flowData.totalSteps} steps`} size="small" />
          <Chip label={flowData.estimatedDuration} size="small" variant="outlined" />
        </Box>

        <Stepper orientation="vertical">
          {flowData.steps.map((step) => (
            <Step key={step.step} active>
              <StepLabel>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="subtitle2">{step.category}</Typography>
                  <Chip label={step.algorithm} size="small" />
                </Box>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary" paragraph>
                  {step.reason}
                </Typography>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Parameters:
                  </Typography>
                  <Box sx={{ pl: 2 }}>
                    {Object.entries(step.parameters).map(([key, value]) => (
                      <Typography key={key} variant="caption" display="block">
                        • {key}: {JSON.stringify(value)}
                      </Typography>
                    ))}
                  </Box>
                </Box>
                <Chip label={`~${step.estimatedTime}`} size="small" color="info" />
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </CardContent>
      <CardActions>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={() => onExecuteFlow?.(flowData)}
          fullWidth
        >
          Execute This Flow
        </Button>
      </CardActions>
    </Card>
  );

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <AutoFixHighIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5">AI Design Flow Generator</Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Describe your chip design requirements in natural language, and AI will generate a complete
        design flow with algorithm recommendations and parameters.
      </Alert>

      <TextField
        fullWidth
        multiline
        rows={4}
        label="Design Requirements"
        placeholder="Example: I need to design a low-power IoT chip with 500 gates, targeting 100MHz operation..."
        value={requirements}
        onChange={(e) => setRequirements(e.target.value)}
        sx={{ mb: 3 }}
      />

      <Typography variant="subtitle2" gutterBottom>
        Optional Design Specifications
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth size="small">
            <InputLabel>Chip Type</InputLabel>
            <Select value={chipType} onChange={(e) => setChipType(e.target.value)} label="Chip Type">
              <MenuItem value="">Not specified</MenuItem>
              <MenuItem value="IoT">IoT/Embedded</MenuItem>
              <MenuItem value="ASIC">ASIC</MenuItem>
              <MenuItem value="GPU">GPU/Accelerator</MenuItem>
              <MenuItem value="CPU">CPU/Processor</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Gate Count"
            type="number"
            value={gateCount}
            onChange={(e) => setGateCount(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            size="small"
            label="Power Budget (mW)"
            type="number"
            value={powerBudget}
            onChange={(e) => setPowerBudget(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            size="small"
            label="Frequency (MHz)"
            type="number"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Priority</InputLabel>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)} label="Priority">
              <MenuItem value="speed">Speed</MenuItem>
              <MenuItem value="power">Power</MenuItem>
              <MenuItem value="area">Area</MenuItem>
              <MenuItem value="balanced">Balanced</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} /> : <AutoFixHighIcon />}
          onClick={() => handleGenerate(false)}
          disabled={!requirements.trim() || loading}
          fullWidth
        >
          Generate Flow
        </Button>
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={20} /> : <CompareArrowsIcon />}
          onClick={() => handleGenerate(true)}
          disabled={!requirements.trim() || loading}
          fullWidth
        >
          Generate Alternatives
        </Button>
      </Box>

      {flow && (
        <>
          <Divider sx={{ my: 4 }} />
          <Typography variant="h6" gutterBottom>
            Generated Design Flow
          </Typography>
          {renderFlowCard(flow)}
        </>
      )}

      {showAlternatives && alternatives.length > 0 && (
        <>
          <Divider sx={{ my: 4 }} />
          <Typography variant="h6" gutterBottom>
            Alternative Flows
          </Typography>
          <Grid container spacing={2}>
            {alternatives.map((alt, index) => (
              <Grid item xs={12} md={6} key={index}>
                {renderFlowCard(alt, `Alternative ${index + 1}`)}
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Paper>
  );
}
