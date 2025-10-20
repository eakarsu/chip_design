import { Container, Box, Typography, Paper, Grid, Button, Chip, Card, CardContent } from '@mui/material';
import Hero from '@/components/Hero';
import DownloadIcon from '@mui/icons-material/Download';
import CodeIcon from '@mui/icons-material/Code';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';

const sdks = [
  {
    name: 'Python SDK',
    version: '2.1.0',
    language: 'Python',
    icon: '🐍',
    description: 'Official Python SDK with PyTorch and TensorFlow integration',
    install: 'pip install neuralchip',
    features: ['PyTorch support', 'TensorFlow support', 'NumPy integration', 'Async operations'],
    docs: '/docs/python',
    github: 'https://github.com/neuralchip/sdk-python',
  },
  {
    name: 'JavaScript/TypeScript SDK',
    version: '1.8.0',
    language: 'JavaScript',
    icon: '📦',
    description: 'Node.js and browser SDK with TypeScript definitions',
    install: 'npm install @neuralchip/sdk',
    features: ['TypeScript support', 'Promise-based API', 'Browser compatible', 'Node.js support'],
    docs: '/docs/javascript',
    github: 'https://github.com/neuralchip/sdk-js',
  },
  {
    name: 'Go SDK',
    version: '1.5.0',
    language: 'Go',
    icon: '🔷',
    description: 'High-performance Go SDK for backend services',
    install: 'go get github.com/neuralchip/sdk-go',
    features: ['Concurrent requests', 'Streaming support', 'Zero dependencies', 'gRPC support'],
    docs: '/docs/go',
    github: 'https://github.com/neuralchip/sdk-go',
  },
  {
    name: 'Rust SDK',
    version: '0.9.0',
    language: 'Rust',
    icon: '🦀',
    description: 'Memory-safe Rust SDK for embedded and edge devices',
    install: 'cargo add neuralchip',
    features: ['Zero-copy operations', 'Safe concurrency', 'No runtime overhead', 'WASM support'],
    docs: '/docs/rust',
    github: 'https://github.com/neuralchip/sdk-rust',
  },
  {
    name: 'C++ SDK',
    version: '2.0.0',
    language: 'C++',
    icon: '⚡',
    description: 'Native C++ SDK for maximum performance',
    install: 'Download from GitHub releases',
    features: ['C++17 standard', 'Header-only option', 'CUDA integration', 'OpenMP support'],
    docs: '/docs/cpp',
    github: 'https://github.com/neuralchip/sdk-cpp',
  },
  {
    name: 'Java SDK',
    version: '1.6.0',
    language: 'Java',
    icon: '☕',
    description: 'JVM SDK for enterprise applications',
    install: 'Add Maven or Gradle dependency',
    features: ['Spring integration', 'Thread-safe', 'Connection pooling', 'Kotlin support'],
    docs: '/docs/java',
    github: 'https://github.com/neuralchip/sdk-java',
  },
];

const tools = [
  {
    name: 'NeuralChip CLI',
    description: 'Command-line interface for model deployment and management',
    install: 'curl -fsSL https://get.neuralchip.ai | sh',
    features: ['Model conversion', 'Deployment automation', 'Performance profiling', 'Cloud sync'],
  },
  {
    name: 'VS Code Extension',
    description: 'IDE integration with IntelliSense and debugging support',
    install: 'Install from VS Code Marketplace',
    features: ['Syntax highlighting', 'Code completion', 'Debugging tools', 'Model visualization'],
  },
  {
    name: 'Docker Images',
    description: 'Pre-built Docker images with runtime and SDKs',
    install: 'docker pull neuralchip/runtime:latest',
    features: ['GPU support', 'Multiple versions', 'Slim variants', 'CI/CD ready'],
  },
  {
    name: 'Kubernetes Operator',
    description: 'Deploy and manage NeuralChip workloads on Kubernetes',
    install: 'kubectl apply -f https://get.neuralchip.ai/k8s',
    features: ['Auto-scaling', 'Load balancing', 'Health checks', 'Rolling updates'],
  },
];

export default function SDKsPage() {
  return (
    <>
      <Hero
        title="SDKs & Developer Tools"
        subtitle="Official SDKs, tools, and libraries for every language and platform"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* SDKs */}
        <Box sx={{ mb: 10 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            Official SDKs
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            Production-ready SDKs maintained by the NeuralChip team
          </Typography>

          <Grid container spacing={3}>
            {sdks.map((sdk) => (
              <Grid item xs={12} md={6} key={sdk.name}>
                <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Typography variant="h3">{sdk.icon}</Typography>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {sdk.name}
                        </Typography>
                        <Chip label={`v${sdk.version}`} size="small" variant="outlined" />
                      </Box>
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {sdk.description}
                    </Typography>

                    <Paper
                      sx={{
                        p: 1.5,
                        mb: 2,
                        bgcolor: 'background.default',
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                      }}
                    >
                      {sdk.install}
                    </Paper>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
                        Features:
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {sdk.features.map((feature) => (
                          <Chip key={feature} label={feature} size="small" variant="outlined" />
                        ))}
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<LibraryBooksIcon />}
                        href={sdk.docs}
                      >
                        Docs
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<CodeIcon />}
                        href={sdk.github}
                        target="_blank"
                      >
                        GitHub
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Developer Tools */}
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            Developer Tools
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            Essential tools for development, deployment, and debugging
          </Typography>

          <Grid container spacing={3}>
            {tools.map((tool) => (
              <Grid item xs={12} md={6} key={tool.name}>
                <Paper sx={{ p: 3, height: '100%', border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    {tool.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {tool.description}
                  </Typography>

                  <Paper
                    sx={{
                      p: 1.5,
                      mb: 2,
                      bgcolor: 'background.default',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      overflow: 'auto',
                    }}
                  >
                    {tool.install}
                  </Paper>

                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
                      Features:
                    </Typography>
                    <Box component="ul" sx={{ pl: 2, m: 0, '& li': { fontSize: '0.875rem', mb: 0.5 } }}>
                      {tool.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Community Resources */}
        <Box sx={{ mt: 10, p: 4, bgcolor: 'primary.main', color: 'white', borderRadius: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            Need Help?
          </Typography>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Join our developer community for support, discussions, and updates
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: 'grey.100' } }}
              href="https://discord.gg/neuralchip"
              target="_blank"
            >
              Discord Community
            </Button>
            <Button
              variant="outlined"
              sx={{ borderColor: 'white', color: 'white', '&:hover': { borderColor: 'grey.300', bgcolor: 'rgba(255,255,255,0.1)' } }}
              href="https://github.com/neuralchip"
              target="_blank"
            >
              GitHub Organization
            </Button>
            <Button
              variant="outlined"
              sx={{ borderColor: 'white', color: 'white', '&:hover': { borderColor: 'grey.300', bgcolor: 'rgba(255,255,255,0.1)' } }}
              href="/docs"
            >
              Documentation
            </Button>
          </Box>
        </Box>
      </Container>
    </>
  );
}
