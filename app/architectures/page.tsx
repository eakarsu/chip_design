import { Container, Box, Typography, Grid, Card, CardContent, Divider } from '@mui/material';
import Hero from '@/components/Hero';
import FeatureGrid from '@/components/FeatureGrid';
import CodeTabs from '@/components/CodeTabs';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Architectures',
  description: 'Deep dive into NeuralChip architecture: tensor cores, memory hierarchy, and custom silicon innovations.',
};

const architectureFeatures = [
  {
    icon: 'category',
    title: 'Programmable Tensor Cores',
    description: 'Flexible tensor processing units supporting INT4/INT8/FP16/BF16/FP32 with dynamic precision switching for optimal performance.',
  },
  {
    icon: 'storage',
    title: 'Hierarchical Memory',
    description: 'Multi-level cache hierarchy with 256KB L1, 32MB L2, and HBM3 main memory delivering 3.2 TB/s bandwidth.',
  },
  {
    icon: 'account_tree',
    title: 'Heterogeneous Compute',
    description: 'Mixed compute clusters combining scalar, vector, and tensor units for diverse AI workload optimization.',
  },
  {
    icon: 'lan',
    title: 'High-Speed Interconnect',
    description: 'Custom NeuralLink fabric with 900 GB/s chip-to-chip bandwidth for seamless multi-accelerator scaling.',
  },
  {
    icon: 'settings_suggest',
    title: 'Hardware Sparsity',
    description: 'Native support for structured and unstructured sparsity achieving up to 4x speedup on sparse models.',
  },
  {
    icon: 'psychology',
    title: 'Attention Accelerator',
    description: 'Dedicated hardware for self-attention and cross-attention operations with fused kernel support.',
  },
];

const codeExamples = [
  {
    language: 'python',
    label: 'Python SDK',
    code: `import neuralchip as nc

# Initialize NeuralChip device
device = nc.Device("C7")

# Load and optimize model
model = nc.Model.from_pytorch("resnet50.pth")
optimized = model.optimize(
    precision="fp16",
    batch_size=64,
    enable_sparsity=True
)

# Run inference
input_tensor = nc.Tensor(data, device=device)
output = optimized.infer(input_tensor)
print(f"Latency: {output.latency_ms:.2f}ms")`,
  },
  {
    language: 'c++',
    label: 'C++ API',
    code: `#include <neuralchip/runtime.hpp>

// Create runtime context
auto runtime = nc::Runtime::create("C7");
auto model = nc::Model::load("resnet50.onnx");

// Compile with optimizations
auto compiled = model.compile({
    .precision = nc::Precision::FP16,
    .batch_size = 64,
    .enable_sparsity = true
});

// Execute inference
auto input = nc::Tensor::from_data(data);
auto output = compiled->execute(input);
std::cout << "Latency: " << output.latency_ms() << "ms\\n";`,
  },
  {
    language: 'bash',
    label: 'CLI',
    code: `# Convert PyTorch model to NeuralChip format
neuralchip convert --input model.pth --output model.ncm

# Benchmark model
neuralchip benchmark model.ncm \\
  --device C7 \\
  --batch-size 64 \\
  --precision fp16

# Deploy to production
neuralchip deploy model.ncm \\
  --endpoint https://api.example.com \\
  --replicas 4`,
  },
];

export default function ArchitecturesPage() {
  return (
    <>
      <Hero
        title="Architecture Deep Dive"
        subtitle="Explore the cutting-edge silicon innovations powering next-generation AI workloads"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Core Architecture */}
        <Box sx={{ mb: 10 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 4 }}>
            Core Architecture
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    Compute Clusters
                  </Typography>
                  <Box component="ul" sx={{ pl: 2, '& li': { mb: 1.5 } }}>
                    <li>
                      <Typography variant="body2">
                        <strong>128 Tensor Cores:</strong> 4096 MAC units per core @ 2.5 GHz
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body2">
                        <strong>64 Vector Units:</strong> 256-bit SIMD with AVX-512 extensions
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body2">
                        <strong>32 Scalar Processors:</strong> RISC-V RV64GC for control flow
                      </Typography>
                    </li>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    Memory Subsystem
                  </Typography>
                  <Box component="ul" sx={{ pl: 2, '& li': { mb: 1.5 } }}>
                    <li>
                      <Typography variant="body2">
                        <strong>L1 Cache:</strong> 256 KB per cluster with 32-way associativity
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body2">
                        <strong>L2 Cache:</strong> 32 MB shared, 2 TB/s internal bandwidth
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body2">
                        <strong>HBM3 DRAM:</strong> 96 GB @ 3.2 TB/s with ECC support
                      </Typography>
                    </li>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* Features */}
        <FeatureGrid features={architectureFeatures} />

        <Divider sx={{ my: 10 }} />

        {/* SDK Examples */}
        <Box sx={{ mb: 10 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            Developer SDK
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            Simple, powerful APIs for Python, C++, and CLI with seamless framework integration
          </Typography>
          <CodeTabs examples={codeExamples} />
        </Box>

        {/* Specifications */}
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 4 }}>
            Technical Specifications
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: 'primary.main' }}>
                    Process & Packaging
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Process Node</Typography>
                      <Typography variant="body2" fontWeight={500}>TSMC 5nm FinFET</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Die Size</Typography>
                      <Typography variant="body2" fontWeight={500}>826 mm²</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Transistors</Typography>
                      <Typography variant="body2" fontWeight={500}>80 Billion</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Package</Typography>
                      <Typography variant="body2" fontWeight={500}>CoWoS-S 2.5D</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: 'primary.main' }}>
                    Power & Thermal
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">TDP</Typography>
                      <Typography variant="body2" fontWeight={500}>300W</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Idle Power</Typography>
                      <Typography variant="body2" fontWeight={500}>15W</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Operating Temp</Typography>
                      <Typography variant="body2" fontWeight={500}>0-90°C</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Cooling</Typography>
                      <Typography variant="body2" fontWeight={500}>Active + Liquid</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </>
  );
}
