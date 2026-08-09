import { createEnterpriseAdapterServer } from '../src/lib/integrations/enterpriseAdapterServer';

const host = process.env.CHIP_ADAPTER_HOST?.trim() || '0.0.0.0';
const port = Number(process.env.CHIP_ADAPTER_PORT?.trim() || '3010');
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('CHIP_ADAPTER_PORT must be a valid TCP port');
}

const server = createEnterpriseAdapterServer();
server.listen(port, host, () => {
  console.log(`NeuralChip enterprise adapter listening on ${host}:${port}`);
});

function shutdown(): void {
  server.close(error => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
