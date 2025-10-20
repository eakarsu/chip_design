import { Container, Box, Typography, Paper, Grid, Divider, Chip } from '@mui/material';
import Hero from '@/components/Hero';
import CodeTabs from '@/components/CodeTabs';

const apiEndpoints = [
  {
    method: 'POST',
    endpoint: '/v1/inference',
    description: 'Execute inference on a deployed model',
    example: `curl -X POST https://api.neuralchip.ai/v1/inference \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model_id": "resnet50-fp16",
    "input": {
      "data": "base64_encoded_image"
    },
    "options": {
      "batch_size": 1,
      "precision": "fp16"
    }
  }'`,
  },
  {
    method: 'GET',
    endpoint: '/v1/models',
    description: 'List all deployed models',
    example: `curl https://api.neuralchip.ai/v1/models \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
  },
  {
    method: 'POST',
    endpoint: '/v1/models/deploy',
    description: 'Deploy a new model',
    example: `curl -X POST https://api.neuralchip.ai/v1/models/deploy \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "model=@model.ncm" \\
  -F "config=@config.json"`,
  },
  {
    method: 'DELETE',
    endpoint: '/v1/models/{model_id}',
    description: 'Delete a deployed model',
    example: `curl -X DELETE https://api.neuralchip.ai/v1/models/resnet50-fp16 \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
  },
];

const codeExamples = [
  {
    language: 'python',
    label: 'Python',
    code: `import neuralchip

# Initialize client
client = neuralchip.Client(api_key="YOUR_API_KEY")

# Run inference
result = client.inference(
    model_id="resnet50-fp16",
    input_data=image_data,
    batch_size=1,
    precision="fp16"
)

print(f"Result: {result.output}")
print(f"Latency: {result.latency_ms}ms")`,
  },
  {
    language: 'javascript',
    label: 'JavaScript',
    code: `import { NeuralChipClient } from '@neuralchip/sdk';

// Initialize client
const client = new NeuralChipClient({
  apiKey: 'YOUR_API_KEY'
});

// Run inference
const result = await client.inference({
  modelId: 'resnet50-fp16',
  inputData: imageData,
  batchSize: 1,
  precision: 'fp16'
});

console.log('Result:', result.output);
console.log('Latency:', result.latencyMs, 'ms');`,
  },
  {
    language: 'go',
    label: 'Go',
    code: `package main

import (
    "github.com/neuralchip/sdk-go"
)

func main() {
    // Initialize client
    client := neuralchip.NewClient("YOUR_API_KEY")

    // Run inference
    result, err := client.Inference(&neuralchip.InferenceRequest{
        ModelID: "resnet50-fp16",
        InputData: imageData,
        BatchSize: 1,
        Precision: "fp16",
    })

    if err != nil {
        panic(err)
    }

    fmt.Printf("Result: %v\\n", result.Output)
    fmt.Printf("Latency: %dms\\n", result.LatencyMs)
}`,
  },
];

export default function APIReferencePage() {
  return (
    <>
      <Hero
        title="API Reference"
        subtitle="Complete REST API documentation for NeuralChip platform"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Getting Started */}
        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            Getting Started
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            The NeuralChip API provides programmatic access to our AI acceleration platform.
            All API requests require authentication using an API key.
          </Typography>

          <Paper sx={{ p: 3, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Base URL
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'primary.main' }}>
              https://api.neuralchip.ai
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Authentication
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Include your API key in the Authorization header:
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
              Authorization: Bearer YOUR_API_KEY
            </Typography>
          </Paper>
        </Box>

        {/* Code Examples */}
        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            Quick Start
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Get started with our official SDKs in your preferred language
          </Typography>
          <CodeTabs examples={codeExamples} />
        </Box>

        {/* API Endpoints */}
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 4 }}>
            API Endpoints
          </Typography>

          <Grid container spacing={3}>
            {apiEndpoints.map((endpoint, index) => (
              <Grid item xs={12} key={index}>
                <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Chip
                      label={endpoint.method}
                      color={
                        endpoint.method === 'GET' ? 'success' :
                        endpoint.method === 'POST' ? 'primary' :
                        endpoint.method === 'DELETE' ? 'error' :
                        'default'
                      }
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                    <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {endpoint.endpoint}
                    </Typography>
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {endpoint.description}
                  </Typography>

                  <Paper
                    component="pre"
                    sx={{
                      p: 2,
                      bgcolor: 'background.default',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <code>{endpoint.example}</code>
                  </Paper>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Rate Limits */}
        <Box sx={{ mt: 8 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 3 }}>
            Rate Limits
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
                <Typography variant="h3" color="primary.main" sx={{ fontWeight: 700 }}>
                  1000
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Requests per minute (Free tier)
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
                <Typography variant="h3" color="primary.main" sx={{ fontWeight: 700 }}>
                  10,000
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Requests per minute (Pro tier)
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
                <Typography variant="h3" color="primary.main" sx={{ fontWeight: 700 }}>
                  Custom
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Enterprise plans available
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </>
  );
}
