import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './config/env.js';

async function main() {
  const app = buildApp();

  // Start server
  const address = await app.listen({
    port: env.PORT,
    host: '0.0.0.0',
  });

  app.log.info(`Server listening at ${address}`);
  app.log.info(`Health: GET ${address}/health`);
  app.log.info(`Health Ready: GET ${address}/health/ready`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
