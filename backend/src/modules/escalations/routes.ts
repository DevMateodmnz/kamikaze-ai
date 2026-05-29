/**
 * Escalations Routes
 *
 * Placeholder routes - NOT IMPLEMENTED
 *
 * Will be implemented in Phase 4
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../../utils/app-error.js';

export const escalationsRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/escalations/active
  app.get('/active', async () => {
    throw new AppError('Escalations module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });

  // GET /api/v1/escalations/:id
  app.get('/:id', async (_request: FastifyRequest, _reply: FastifyReply) => {
    throw new AppError('Escalations module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });

  // PATCH /api/v1/escalations/:id/notify
  app.patch('/:id/notify', async (_request: FastifyRequest, _reply: FastifyReply) => {
    throw new AppError('Escalations module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });

  // PATCH /api/v1/escalations/:id/resolve
  app.patch(
    '/:id/resolve',
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      throw new AppError('Escalations module not implemented', {
        statusCode: 501,
        code: 'NOT_IMPLEMENTED',
      });
    }
  );
};
