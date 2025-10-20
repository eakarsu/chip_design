'use client';

import { useState } from 'react';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Close as CloseIcon,
  Speed as SpeedIcon,
  Star as StarIcon,
  School as SchoolIcon,
} from '@mui/icons-material';
import { AlgorithmCategory } from '@/types/algorithms';
import {
  AlgorithmTemplate,
  getTemplatesByCategory,
  getTemplatesByDifficulty,
  searchTemplates,
  getAllTags,
} from '@/lib/templates';

interface TemplateSelectorProps {
  open: boolean;
  onClose: () => void;
  category: AlgorithmCategory;
  onSelectTemplate: (template: AlgorithmTemplate) => void;
}

export default function TemplateSelector({
  open,
  onClose,
  category,
  onSelectTemplate,
}: TemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');

  // Get templates for current category
  const categoryTemplates = getTemplatesByCategory(category);

  // Filter by search and difficulty
  let filteredTemplates = categoryTemplates;

  if (searchQuery) {
    filteredTemplates = searchTemplates(searchQuery).filter(t => t.category === category);
  }

  if (selectedDifficulty !== 'all') {
    filteredTemplates = filteredTemplates.filter(t => t.difficulty === selectedDifficulty);
  }

  const handleSelectTemplate = (template: AlgorithmTemplate) => {
    onSelectTemplate(template);
    onClose();
  };

  const getDifficultyIcon = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return <SchoolIcon fontSize="small" />;
      case 'intermediate':
        return <StarIcon fontSize="small" />;
      case 'advanced':
        return <SpeedIcon fontSize="small" />;
      default:
        return null;
    }
  };

  const getDifficultyColor = (difficulty: string): 'success' | 'info' | 'warning' => {
    switch (difficulty) {
      case 'beginner':
        return 'success';
      case 'intermediate':
        return 'info';
      case 'advanced':
        return 'warning';
      default:
        return 'info';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Select Template</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Search Bar */}
        <TextField
          fullWidth
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        {/* Difficulty Filter */}
        <Box sx={{ mb: 3 }}>
          <Tabs
            value={selectedDifficulty}
            onChange={(_, value) => setSelectedDifficulty(value)}
            variant="fullWidth"
          >
            <Tab label="All" value="all" />
            <Tab label="Beginner" value="beginner" icon={<SchoolIcon />} iconPosition="start" />
            <Tab label="Intermediate" value="intermediate" icon={<StarIcon />} iconPosition="start" />
            <Tab label="Advanced" value="advanced" icon={<SpeedIcon />} iconPosition="start" />
          </Tabs>
        </Box>

        {/* Templates Grid */}
        {filteredTemplates.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body1" color="text.secondary">
              No templates found for "{searchQuery}"
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {filteredTemplates.map((template) => (
              <Grid item xs={12} key={template.id}>
                <Card variant="outlined" sx={{ '&:hover': { borderColor: 'primary.main', boxShadow: 2 } }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                      <Typography variant="h6" component="div">
                        {template.name}
                      </Typography>
                      <Chip
                        icon={getDifficultyIcon(template.difficulty)}
                        label={template.difficulty}
                        color={getDifficultyColor(template.difficulty)}
                        size="small"
                      />
                    </Box>

                    <Typography variant="body2" color="text.secondary" paragraph>
                      {template.description}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                      {template.tags.map((tag) => (
                        <Chip key={tag} label={tag} size="small" variant="outlined" />
                      ))}
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Algorithm: {template.algorithm.replace('_', ' ')}
                      </Typography>
                      <Tooltip title="Estimated runtime">
                        <Chip
                          icon={<SpeedIcon />}
                          label={template.estimatedRuntime}
                          size="small"
                          variant="outlined"
                        />
                      </Tooltip>
                    </Box>
                  </CardContent>

                  <CardActions>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => handleSelectTemplate(template)}
                    >
                      Use This Template
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
