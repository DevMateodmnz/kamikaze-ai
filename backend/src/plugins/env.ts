import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance } from 'fastify';
import { validateEnv } from '../config/env.js';

export const envPlugin: FastifyPluginAsync = async (_app: FastifyInstance) => {
  // Validate environment on startup - throws if invalid
  validateEnv();
};
