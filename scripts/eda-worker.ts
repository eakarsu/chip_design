import { runWorker } from '../src/lib/eda/worker';

runWorker({ once: process.argv.includes('--once') }).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
