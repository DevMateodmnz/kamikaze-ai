/**
 * Knowledge Base Routes
 *
 * Placeholder routes - NOT IMPLEMENTED
 *
 * Will be implemented in Phase 2
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../utils/app-error.js';

export const knowledgeBaseRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/search', async () => {
    throw new AppError('Knowledge Base module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });

  app.get('/category/:category', async () => {
    throw new AppError('Knowledge Base module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });

  app.get('/store-info', async () => {
    throw new AppError('Knowledge Base module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });

  app.get('/faqs', async () => {
    throw new AppError('Knowledge Base module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });
};
