import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance } from 'fastify';
import { healthRoutes } from '../routes/health.routes.js';

export const healthPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  void app.register(healthRoutes);
};
