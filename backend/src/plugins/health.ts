import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance } from 'fastify';
import { healthRoutes } from '../routes/health.routes.js';

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify detects async plugins at runtime.
export const healthPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  void app.register(healthRoutes);
};
