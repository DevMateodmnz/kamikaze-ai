/**
 * Messages Routes
 *
 * POST /api/v1/messages/inbound - Store inbound message from WhatsApp
 * POST /api/v1/messages/outbound - Store outbound bot response
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { messagesService } from './service.js';
import { conversationsService } from '../conversations/service.js';

const inboundMessageSchema = z.object({
  whatsappMessageId: z.string().min(1).max(100),
  from: z.string().min(1).max(20),
  text: z.string().min(1).max(4096),
  timestamp: z.string().regex(/^\d+$/).optional(),
});

const outboundMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1).max(4096),
  intent: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  aiProvider: z.string().optional(),
  tokensUsed: z.number().int().min(0).optional(),
});

export { inboundMessageSchema };

export const messagesRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/v1/messages/inbound
  app.post(
    '/inbound',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            whatsappMessageId: { type: 'string' },
            from: { type: 'string' },
            text: { type: 'string' },
            timestamp: { type: 'string' },
          },
          required: ['from', 'text'],
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const parseResult = inboundMessageSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError('Invalid inbound message payload', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const result = await messagesService.storeInboundMessage({
        whatsappMessageId: parseResult.data.whatsappMessageId,
        from: parseResult.data.from,
        text: parseResult.data.text,
        timestamp: parseResult.data.timestamp,
      });

      return {
        success: true,
        messageId: result.message.id,
        conversationId: result.conversation.id,
        customerId: result.customer.id,
        duplicate: result.duplicate,
      };
    }
  );

  // POST /api/v1/messages/outbound
  app.post(
    '/outbound',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            conversationId: { type: 'string' },
            content: { type: 'string' },
            intent: { type: 'string' },
            confidence: { type: 'number' },
            aiProvider: { type: 'string' },
            tokensUsed: { type: 'number' },
          },
          required: ['conversationId', 'content'],
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const parseResult = outboundMessageSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError('Invalid outbound message payload', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      // Verify conversation exists
      const conversation = await conversationsService.getConversationById(
        parseResult.data.conversationId
      );
      if (!conversation) {
        throw new AppError('Conversation not found', {
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }

      const message = await messagesService.storeOutboundMessage({
        conversationId: parseResult.data.conversationId,
        content: parseResult.data.content,
        intent: parseResult.data.intent,
        confidence: parseResult.data.confidence,
        aiProvider: parseResult.data.aiProvider,
        tokensUsed: parseResult.data.tokensUsed,
      });

      return {
        success: true,
        messageId: message.id,
        conversationId: message.conversationId,
      };
    }
  );
};