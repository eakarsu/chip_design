import fs from 'fs';
import path from 'path';
import { validateGolden, type GoldenManifest, type GoldenObservation } from '../src/lib/eda/golden';

const target = process.argv[2] ?? path.join('fixtures', 'eda', 'tiny_reference', 'golden.json');
const document = JSON.parse(fs.readFileSync(target, 'utf8')) as {
  manifest: GoldenManifest; observation: GoldenObservation;
};
const result = validateGolden(document.manifest, document.observation);
if (!result.passed) {
  console.error(result.failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Golden validation passed: ${document.manifest.name}`);
}
