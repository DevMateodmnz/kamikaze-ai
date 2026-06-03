import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { healthPlugin } from './plugins/health.js';
import { envPlugin } from './plugins/env.js';
import { errorHandler } from './plugins/error-handler.js';
import { apiRouter } from './routes/api/index.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { colorize: true },
            }
          : undefined,
    },
    disableRequestLogging: false,
  });

  // Register global plugins
  void app.register(envPlugin);
  void app.register(formbody);
  void app.register(cors, {
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });
  void app.setErrorHandler(errorHandler);

  // Register routes
  void app.register(healthPlugin);
  void app.register(apiRouter, { prefix: '/api/v1' });

  return app;
}
