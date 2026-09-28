/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';
import { modelHmtMemory } from '@/lib/ai-systems/hmt';
import { exploreQuantization } from '@/lib/ai-systems/quantization';
import { modelLutDotProduct } from '@/lib/ai-systems/lutInference';
import { planHybridPipeline } from '@/lib/ai-systems/hybrid';
import { projectMemoryTechnology } from '@/lib/ai-systems/memoryTech';

const SCANNED_DIRECTORIES = [
  path.join(process.cwd(), 'src', 'lib', 'ai-systems'),
  path.join(process.cwd(), 'app', 'api', 'ai-systems'),
];

function collectTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(fullPath);
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

const allModelOutputs = () => ({
  hmt: modelHmtMemory({ modelDim: 64, layerCount: 4, sequenceLength: 2048 }),
  quantization: exploreQuantization({
    scheme: 'int4',
    weightCount: 65_536,
    activationElementsPerToken: 4096,
    hadamardRotation: true,
  }),
  lut: modelLutDotProduct({ vectorDim: 64, subvectorDim: 8, codebookSize: 256 }),
  hybrid: planHybridPipeline({
    stages: [
      { id: 'memory-preparation', opCount: 1e9, bytesMoved: 4e9 },
      { id: 'relevance-scoring', opCount: 2e9, bytesMoved: 2e9 },
      { id: 'top-k-retrieval', opCount: 5e8, bytesMoved: 1e9 },
      { id: 'attention', opCount: 1e12, bytesMoved: 1e9 },
    ],
    gpuHourlyUsd: 2.5,
    fpgaHourlyUsd: 1.5,
  }),
  memoryTech: projectMemoryTechnology({
    featureSizeNm: 20,
    dieAreaMm2: 100,
    bandwidthGbPerSecond: 64,
    modelBytesPerToken: 1e9,
  }),
});

describe('ai-systems determinism and labeling', () => {
  it('never uses Math.random in library or route sources', () => {
    const files = SCANNED_DIRECTORIES.flatMap(collectTypeScriptFiles);
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/Math\.random/);
    }
  });

  it('produces byte-identical JSON for identical inputs across every model', () => {
    expect(JSON.stringify(allModelOutputs())).toBe(JSON.stringify(allModelOutputs()));
  });

  it('labels every model output as an estimate with assumptions and limitations', () => {
    const outputs = allModelOutputs();
    for (const [name, output] of Object.entries(outputs)) {
      expect(`${name}:${output.label}`).toBe(`${name}:analytical-estimate`);
      expect(Array.isArray(output.assumptions)).toBe(true);
      expect(output.assumptions.length).toBeGreaterThan(0);
      expect(Array.isArray(output.limitations)).toBe(true);
      expect(output.limitations.length).toBeGreaterThan(0);
      expect(output.disclaimer).toMatch(/not measured performance/i);
    }
  });
});
