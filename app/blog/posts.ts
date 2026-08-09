export type BlogPost = {
  title: string;
  excerpt: string;
  author: string;
  date: string;
  category: string;
  image: string;
  slug: string;
  sections: Array<{ heading: string; body: string }>;
};

export const blogPosts: BlogPost[] = [
  {
    title: 'Introducing NeuralChip C7: Our Most Powerful AI Accelerator Yet',
    excerpt: 'A technical overview of the architecture and verification evidence behind a high-throughput cloud accelerator concept.',
    author: 'Dr. Sarah Chen', date: '2024-01-15', category: 'Architecture',
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=600&fit=crop',
    slug: 'introducing-neuralchip-c7',
    sections: [
      { heading: 'Architecture objective', body: 'The C7 reference architecture balances compute density, memory bandwidth, power delivery, thermal limits and software programmability. Every headline metric remains a target until it is supported by reproducible implementation and signoff evidence.' },
      { heading: 'Evidence before claims', body: 'Architecture review links workload assumptions to cycle-accurate performance, synthesis, physical-design, timing, power, IR/EM and verification artifacts. The governed workspace keeps those artifacts versioned and routes exceptions to accountable reviewers.' },
      { heading: 'Operational next step', body: 'Create a project workspace, capture the PDK and corner assumptions, run the reference flow and compare measured PPA against the approved baseline before accepting an optimization.' },
    ],
  },
  {
    title: 'Optimizing Transformer Models for Edge Deployment',
    excerpt: 'A practical decision framework for quantization, sparsity, memory planning and accelerator-aware implementation at the edge.',
    author: 'Michael Rodriguez', date: '2024-01-10', category: 'Tutorial',
    image: 'https://images.unsplash.com/photo-1555255707-c07966088b7b?w=1200&h=600&fit=crop',
    slug: 'optimizing-transformers-edge',
    sections: [
      { heading: 'Start with the workload', body: 'Measure sequence length, batch size, latency, accuracy, memory footprint and energy per inference. A design cannot be optimized responsibly without a representative workload and explicit acceptance thresholds.' },
      { heading: 'Explore controlled tradeoffs', body: 'Evaluate quantization, structured sparsity, operator fusion and memory tiling independently, then combine only changes whose accuracy and hardware effects are traceable. Retain the rejected alternatives and the reason each failed.' },
      { heading: 'Close with silicon evidence', body: 'Model-level gains must survive RTL verification, synthesis, MCMM timing, vector-based power analysis, physical verification and post-silicon characterization. The final decision belongs to accountable engineering owners.' },
    ],
  },
  {
    title: 'Achieving 4x Speedup with Hardware Sparsity', excerpt: 'How structured sparsity changes datapaths, storage, scheduling and verification obligations.', author: 'Dr. James Park', date: '2024-01-05', category: 'Technical', image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&h=600&fit=crop', slug: 'hardware-sparsity-speedup',
    sections: [{ heading: 'Measure the complete system', body: 'Sparse arithmetic helps only when metadata, memory traffic, control divergence and utilization are included. Compare end-to-end workload latency and energy rather than isolated peak operations.' }],
  },
  {
    title: 'MLPerf v3.1 Results: NeuralChip Sets New Records', excerpt: 'How to read benchmark results, configurations and evidence without confusing targets with verified measurements.', author: 'Emily Watson', date: '2023-12-28', category: 'Benchmarks', image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=600&fit=crop', slug: 'mlperf-v3-results',
    sections: [{ heading: 'Reproducibility first', body: 'Benchmark interpretation requires the exact model, dataset, precision, batch size, software stack, hardware configuration and power methodology. Store every input and report with the decision record.' }],
  },
  {
    title: 'Building Energy-Efficient Data Centers with NeuralChip', excerpt: 'A signoff-oriented view of performance per watt, utilization and infrastructure constraints.', author: 'Lisa Zhang', date: '2023-12-20', category: 'Case Study', image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&h=600&fit=crop', slug: 'energy-efficient-datacenters',
    sections: [{ heading: 'Power is a system metric', body: 'Evaluate silicon, memory, networking, cooling and utilization together. A lower chip-power estimate does not establish lower facility energy without workload-normalized measurements.' }],
  },
  {
    title: 'PyTorch 2.2 Support and New SDK Features', excerpt: 'Compiler integration, profiling and reproducible deployment guidance for accelerator software.', author: 'Alex Thompson', date: '2023-12-15', category: 'SDK Update', image: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=1200&h=600&fit=crop', slug: 'pytorch-2-2-support',
    sections: [{ heading: 'Govern the software-to-silicon contract', body: 'Pin framework, compiler, firmware and bitstream versions. Validate operator coverage, numerical accuracy and performance regressions before promoting a deployment baseline.' }],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find(post => post.slug === slug);
}
