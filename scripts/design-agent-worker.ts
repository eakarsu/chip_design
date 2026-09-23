import { runAgentWorker } from '../src/lib/design-search/team';

runAgentWorker({ once: process.argv.includes('--once') }).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
