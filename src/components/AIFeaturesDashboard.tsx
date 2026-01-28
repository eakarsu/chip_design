'use client';

import React from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye';
import DescriptionIcon from '@mui/icons-material/Description';
import SearchIcon from '@mui/icons-material/Search';
import SettingsVoiceIcon from '@mui/icons-material/SettingsVoice';
import SpeedIcon from '@mui/icons-material/Speed';
import CodeIcon from '@mui/icons-material/Code';
import BugReportIcon from '@mui/icons-material/BugReport';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import TuneIcon from '@mui/icons-material/Tune';
import SchoolIcon from '@mui/icons-material/School';
import VerifiedIcon from '@mui/icons-material/Verified';
import PsychologyIcon from '@mui/icons-material/Psychology';

interface AIFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'core' | 'advanced' | 'utilities';
  status: 'ready' | 'beta';
  action: string;
  onAction: () => void;
}

interface AIFeaturesDashboardProps {
  onFeatureSelect?: (featureId: string) => void;
}

export default function AIFeaturesDashboard({ onFeatureSelect }: AIFeaturesDashboardProps) {
  const features: AIFeature[] = [
    {
      id: 'copilot',
      title: 'AI Copilot',
      description: 'Conversational assistant for chip design guidance and automation',
      icon: <SmartToyIcon />,
      category: 'core',
      status: 'ready',
      action: 'Open Copilot',
      onAction: () => onFeatureSelect?.('copilot'),
    },
    {
      id: 'flow-generator',
      title: 'Design Flow Generator',
      description: 'Generate complete multi-step design flows from requirements',
      icon: <AutoFixHighIcon />,
      category: 'core',
      status: 'ready',
      action: 'Generate Flow',
      onAction: () => onFeatureSelect?.('flow-generator'),
    },
    {
      id: 'visual-analysis',
      title: 'Visual Layout Analysis',
      description: 'AI analyzes chip layout images for issues and optimization opportunities',
      icon: <RemoveRedEyeIcon />,
      category: 'core',
      status: 'ready',
      action: 'Analyze Layout',
      onAction: () => onFeatureSelect?.('visual-analysis'),
    },
    {
      id: 'doc-generator',
      title: 'Documentation Generator',
      description: 'Auto-generate professional design documentation and reports',
      icon: <DescriptionIcon />,
      category: 'utilities',
      status: 'ready',
      action: 'Generate Docs',
      onAction: () => onFeatureSelect?.('doc-generator'),
    },
    {
      id: 'semantic-search',
      title: 'Intelligent Search',
      description: 'Semantic search across algorithms, docs, and designs',
      icon: <SearchIcon />,
      category: 'utilities',
      status: 'ready',
      action: 'Search',
      onAction: () => onFeatureSelect?.('semantic-search'),
    },
    {
      id: 'nl-parameters',
      title: 'Natural Language Config',
      description: 'Configure algorithm parameters using natural language',
      icon: <SettingsVoiceIcon />,
      category: 'utilities',
      status: 'ready',
      action: 'Try It',
      onAction: () => onFeatureSelect?.('nl-parameters'),
    },
    {
      id: 'performance-prediction',
      title: 'Performance Prediction',
      description: 'Predict algorithm runtime and quality before execution',
      icon: <SpeedIcon />,
      category: 'advanced',
      status: 'ready',
      action: 'Predict',
      onAction: () => onFeatureSelect?.('performance-prediction'),
    },
    {
      id: 'code-generation',
      title: 'HDL Code Generator',
      description: 'Generate Verilog/VHDL code from specifications',
      icon: <CodeIcon />,
      category: 'advanced',
      status: 'ready',
      action: 'Generate Code',
      onAction: () => onFeatureSelect?.('code-generation'),
    },
    {
      id: 'bug-detection',
      title: 'AI Bug Detection',
      description: 'Proactively detect design issues and violations',
      icon: <BugReportIcon />,
      category: 'advanced',
      status: 'ready',
      action: 'Detect Bugs',
      onAction: () => onFeatureSelect?.('bug-detection'),
    },
    {
      id: 'personalization',
      title: 'Personalized Recommendations',
      description: 'AI learns your preferences and suggests algorithms',
      icon: <PersonIcon />,
      category: 'utilities',
      status: 'ready',
      action: 'View Insights',
      onAction: () => onFeatureSelect?.('personalization'),
    },
    {
      id: 'collaborative',
      title: 'Collaborative Design',
      description: 'AI-mediated design collaboration and merge resolution',
      icon: <GroupsIcon />,
      category: 'advanced',
      status: 'beta',
      action: 'Collaborate',
      onAction: () => onFeatureSelect?.('collaborative'),
    },
    {
      id: 'multi-objective',
      title: 'Multi-Objective Optimization',
      description: 'Explore Pareto-optimal design tradeoffs',
      icon: <TuneIcon />,
      category: 'advanced',
      status: 'ready',
      action: 'Optimize',
      onAction: () => onFeatureSelect?.('multi-objective'),
    },
    {
      id: 'enhanced-rl',
      title: 'Enhanced RL',
      description: 'Advanced reinforcement learning with foundation models',
      icon: <PsychologyIcon />,
      category: 'advanced',
      status: 'beta',
      action: 'Learn More',
      onAction: () => onFeatureSelect?.('enhanced-rl'),
    },
    {
      id: 'test-generation',
      title: 'Test Generation',
      description: 'Automated test case generation for validation',
      icon: <VerifiedIcon />,
      category: 'utilities',
      status: 'ready',
      action: 'Generate Tests',
      onAction: () => onFeatureSelect?.('test-generation'),
    },
    {
      id: 'tutorial-generation',
      title: 'AI Tutorials',
      description: 'Personalized learning paths and interactive tutorials',
      icon: <SchoolIcon />,
      category: 'utilities',
      status: 'ready',
      action: 'Learn',
      onAction: () => onFeatureSelect?.('tutorial-generation'),
    },
  ];

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'core':
        return 'primary';
      case 'advanced':
        return 'secondary';
      case 'utilities':
        return 'info';
      default:
        return 'default';
    }
  };

  const groupedFeatures = {
    core: features.filter((f) => f.category === 'core'),
    advanced: features.filter((f) => f.category === 'advanced'),
    utilities: features.filter((f) => f.category === 'utilities'),
  };

  return (
    <Box>
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          AI-Powered Features
        </Typography>
        <Typography variant="body1" color="text.secondary">
          15 AI features to supercharge your chip design workflow
        </Typography>
      </Box>

      {/* Core Features */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4, mb: 2 }}>
        Core Features
      </Typography>
      <Grid container spacing={3}>
        {groupedFeatures.core.map((feature) => (
          <Grid item xs={12} md={4} key={feature.id}>
            <Card elevation={3} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ color: 'primary.main', mr: 1 }}>{feature.icon}</Box>
                  <Typography variant="h6">{feature.title}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  {feature.description}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip
                    label={feature.category}
                    size="small"
                    color={getCategoryColor(feature.category) as any}
                  />
                  <Chip
                    label={feature.status}
                    size="small"
                    variant="outlined"
                    color={feature.status === 'ready' ? 'success' : 'warning'}
                  />
                </Box>
              </CardContent>
              <CardActions>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => {
                    console.log('Button clicked:', feature.id);
                    feature.onAction();
                  }}
                  startIcon={feature.icon}
                >
                  {feature.action}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Advanced Features */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4, mb: 2 }}>
        Advanced Features
      </Typography>
      <Grid container spacing={3}>
        {groupedFeatures.advanced.map((feature) => (
          <Grid item xs={12} md={4} key={feature.id}>
            <Card elevation={3} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ color: 'secondary.main', mr: 1 }}>{feature.icon}</Box>
                  <Typography variant="h6">{feature.title}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  {feature.description}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip
                    label={feature.category}
                    size="small"
                    color={getCategoryColor(feature.category) as any}
                  />
                  <Chip
                    label={feature.status}
                    size="small"
                    variant="outlined"
                    color={feature.status === 'ready' ? 'success' : 'warning'}
                  />
                </Box>
              </CardContent>
              <CardActions>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => {
                    console.log('Button clicked:', feature.id);
                    feature.onAction();
                  }}
                  startIcon={feature.icon}
                >
                  {feature.action}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Utility Features */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4, mb: 2 }}>
        Utilities
      </Typography>
      <Grid container spacing={3}>
        {groupedFeatures.utilities.map((feature) => (
          <Grid item xs={12} md={4} key={feature.id}>
            <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ color: 'info.main', mr: 1 }}>{feature.icon}</Box>
                  <Typography variant="h6">{feature.title}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  {feature.description}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip
                    label={feature.category}
                    size="small"
                    color={getCategoryColor(feature.category) as any}
                  />
                  <Chip
                    label={feature.status}
                    size="small"
                    variant="outlined"
                    color={feature.status === 'ready' ? 'success' : 'warning'}
                  />
                </Box>
              </CardContent>
              <CardActions>
                <Button
                  fullWidth
                  variant="text"
                  onClick={() => {
                    console.log('Button clicked:', feature.id);
                    feature.onAction();
                  }}
                  startIcon={feature.icon}
                >
                  {feature.action}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
