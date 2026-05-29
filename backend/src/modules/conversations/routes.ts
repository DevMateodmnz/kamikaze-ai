/**
 * Conversations Routes
 *
 * GET /api/v1/conversations/:id - Get conversation by ID
 * POST /api/v1/conversations/:id/escalate - Escalate conversation (scaffold)
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../../utils/app-error.js';
import { conversationsService } from './service.js';

export const conversationsRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/conversations/:id
  app.get(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const conversation = await conversationsService.getConversationById(id);
      if (!conversation) {
        throw new AppError('Conversation not found', {
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }

      return conversation;
    }
  );

  // POST /api/v1/conversations/:id/escalate
  app.post(
    '/:id/escalate',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
            suggestedReply: { type: 'string' },
          },
          required: ['reason'],
        },
      },
    },
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      // Scaffold: escalation requires AI gateway which is out of scope for PR-003
      throw new AppError('Escalation not implemented', {
        statusCode: 501,
        code: 'NOT_IMPLEMENTED',
      });
    }
  );
};