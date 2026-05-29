/**
 * Analytics Routes
 *
 * Placeholder routes - NOT IMPLEMENTED
 *
 * Will be implemented in Phase 3
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../utils/app-error.js';

export const analyticsRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/ai-costs', async () => {
    throw new AppError('Analytics module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });

  app.get('/conversations', async () => {
    throw new AppError('Analytics module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });
};
