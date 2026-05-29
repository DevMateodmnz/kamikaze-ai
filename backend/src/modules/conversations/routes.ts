/**
 * Conversations Routes
 *
 * GET /api/v1/conversations/:id - Get conversation by ID
 * POST /api/v1/conversations/:id/escalate - Create escalation for conversation
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { conversationsService } from './service.js';
import { escalationsService } from '../escalations/service.js';

const idSchema = z.object({
  id: z.string().min(1),
});

const escalateSchema = z.object({
  reason: z.string().min(1),
  reasonDetail: z.string().optional(),
  suggestedReply: z.string().optional(),
});

export { idSchema, escalateSchema };

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
      const parsed = idSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('Invalid ID', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const conversation = await conversationsService.getConversationById(parsed.data.id);
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
  // Create an escalation record for this conversation
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
            reasonDetail: { type: 'string' },
            suggestedReply: { type: 'string' },
          },
          required: ['reason'],
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const paramsParsed = idSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new AppError('Invalid conversation ID', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const bodyParsed = escalateSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        throw new AppError('Invalid escalation payload', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      // Verify conversation exists
      const conversation = await conversationsService.getConversationById(paramsParsed.data.id);
      if (!conversation) {
        throw new AppError('Conversation not found', {
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }

      // Create escalation record
      const escalation = await escalationsService.createEscalation({
        conversationId: paramsParsed.data.id,
        reason: bodyParsed.data.reason,
        reasonDetail: bodyParsed.data.reasonDetail ?? null,
        suggestedReply: bodyParsed.data.suggestedReply ?? null,
      });

      // Update conversation status to ESCALATED
      await conversationsService.updateConversationStatus(paramsParsed.data.id, 'ESCALATED');

      return {
        success: true,
        escalation,
        conversationId: paramsParsed.data.id,
      };
    }
  );
};