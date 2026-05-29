/**
 * Security Routes
 *
 * Placeholder routes - NOT IMPLEMENTED
 *
 * Will be implemented in Phase 1
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../utils/app-error.js';

export const securityRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/security/rate-limit-status
  app.get('/rate-limit-status', async () => {
    throw new AppError('Security rate limiting not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });
};
