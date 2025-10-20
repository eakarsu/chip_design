'use client';

import { useState } from 'react';
import { Container, Typography, Box, Button, Alert } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import AlgorithmComparison from '@/components/AlgorithmComparison';
import { AlgorithmResponse } from '@/types/algorithms';

export default function ComparePage() {
  const [results, setResults] = useState<AlgorithmResponse[]>([]);

  // Sample results for demonstration
  const sampleResults: AlgorithmResponse[] = [
    {
      success: true,
      category: 'placement' as any,
      algorithm: 'simulated_annealing',
      result: {
        success: true,
        cells: [],
        totalWirelength: 3250,
        overlap: 0,
        runtime: 145,
        iterations: 1000,
        convergenceData: [],
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        runtime: 145,
      },
    },
    {
      success: true,
      category: 'placement' as any,
      algorithm: 'genetic',
      result: {
        success: true,
        cells: [],
        totalWirelength: 3420,
        overlap: 0,
        runtime: 230,
        iterations: 500,
        convergenceData: [],
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        runtime: 230,
      },
    },
    {
      success: true,
      category: 'placement' as any,
      algorithm: 'force_directed',
      result: {
        success: true,
        cells: [],
        totalWirelength: 3180,
        overlap: 5,
        runtime: 180,
        iterations: 750,
        convergenceData: [],
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        runtime: 180,
      },
    },
  ];

  const handleLoadSamples = () => {
    setResults(sampleResults);
  };

  const handleRemoveResult = (index: number) => {
    setResults(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setResults([]);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Algorithm Comparison
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Compare multiple algorithm results side-by-side to find the best performer
        </Typography>
      </Box>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleLoadSamples}
        >
          Load Sample Results
        </Button>
        {results.length > 0 && (
          <Button
            variant="outlined"
            color="error"
            onClick={handleClearAll}
          >
            Clear All
          </Button>
        )}
      </Box>

      {/* Instructions */}
      {results.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2" gutterBottom>
            <strong>How to use:</strong>
          </Typography>
          <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
            <li>Click "Load Sample Results" to see a comparison demo</li>
            <li>Run algorithms on the Algorithms page and results will be added here automatically</li>
            <li>Compare metrics like wirelength, runtime, iterations, and more</li>
            <li>Export comparisons as CSV for further analysis</li>
          </ul>
        </Alert>
      )}

      {/* Comparison Component */}
      <AlgorithmComparison
        results={results}
        onRemoveResult={handleRemoveResult}
      />

      {/* Additional Information */}
      {results.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Alert severity="success">
            <Typography variant="body2">
              <strong>Tips:</strong>
            </Typography>
            <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
              <li>Click on metric chips above the chart to compare different metrics</li>
              <li>Green "Best" badges indicate the lowest value (usually better)</li>
              <li>Use the "Export Comparison" button to save as CSV</li>
              <li>Remove individual results using the delete icon</li>
            </ul>
          </Alert>
        </Box>
      )}
    </Container>
  );
}
