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

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify detects async plugins at runtime.
export const analyticsRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/ai-costs', () => {
    throw new AppError('Analytics module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });

  app.get('/conversations', () => {
    throw new AppError('Analytics module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });
};
