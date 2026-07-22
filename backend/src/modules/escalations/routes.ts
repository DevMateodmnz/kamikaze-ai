/**
 * Escalations Routes
 *
 * GET /api/v1/escalations - List escalations
 * GET /api/v1/escalations/active - Get active escalations
 * GET /api/v1/escalations/:id - Get single escalation
 * PATCH /api/v1/escalations/:id/status - Update escalation status
 * PATCH /api/v1/escalations/:id/resolve - Resolve escalation
 * PATCH /api/v1/escalations/:id/notify - Mark as notified
 *
 * Read-only exposure for now. Write endpoints require validation.
 * No external notifications yet.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { escalationsService } from './service.js';

const idSchema = z.object({
  id: z.string().min(1),
});

const statusUpdateSchema = z.object({
  status: z.enum(['OPEN', 'NOTIFIED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
});

const resolveSchema = z.object({
  resolvedBy: z.string().min(1),
  resolutionNote: z.string().optional(),
});

export { idSchema, statusUpdateSchema, resolveSchema };

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify detects async plugins at runtime.
export const escalationsRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/escalations
  // List all escalations, optionally filtered by status
  app.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            limit: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const query = request.query as { status?: string; limit?: string };
      const status = query.status;
      const limitStr = query.limit;
      const limit = limitStr ? parseInt(limitStr, 10) : undefined;

      const escalations = await escalationsService.listEscalations({
        status: status as 'OPEN' | 'NOTIFIED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | undefined,
        limit,
      });

      return {
        success: true,
        count: escalations.length,
        escalations,
      };
    }
  );

  // GET /api/v1/escalations/active
  app.get('/active', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const escalations = await escalationsService.getActiveEscalations();

    return {
      success: true,
      count: escalations.length,
      escalations,
    };
  });

  // GET /api/v1/escalations/:id
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

      const escalation = await escalationsService.getEscalationById(parsed.data.id);
      if (!escalation) {
        throw new AppError('Escalation not found', {
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }

      return {
        success: true,
        escalation,
      };
    }
  );

  // PATCH /api/v1/escalations/:id/status
  // Update escalation status (no notification yet)
  app.patch(
    '/:id/status',
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
            status: { type: 'string' },
          },
          required: ['status'],
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const paramsParsed = idSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new AppError('Invalid ID', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const bodyParsed = statusUpdateSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        throw new AppError('Invalid status', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const escalation = await escalationsService.updateEscalationStatus(
        paramsParsed.data.id,
        bodyParsed.data.status
      );

      return {
        success: true,
        escalation,
      };
    }
  );

  // PATCH /api/v1/escalations/:id/notify
  // Mark escalation as notified (sets notifiedAt, status=NOTIFIED)
  // Does NOT send external notification — that's the next PR
  app.patch(
    '/:id/notify',
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

      const escalation = await escalationsService.markNotified(parsed.data.id);

      return {
        success: true,
        escalation,
      };
    }
  );

  // PATCH /api/v1/escalations/:id/resolve
  app.patch(
    '/:id/resolve',
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
            resolvedBy: { type: 'string' },
            resolutionNote: { type: 'string' },
          },
          required: ['resolvedBy'],
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const paramsParsed = idSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new AppError('Invalid ID', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const bodyParsed = resolveSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        throw new AppError('Invalid resolution payload', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const escalation = await escalationsService.resolveEscalation(
        paramsParsed.data.id,
        {
          resolvedBy: bodyParsed.data.resolvedBy,
          resolutionNote: bodyParsed.data.resolutionNote,
        }
      );

      return {
        success: true,
        escalation,
      };
    }
  );
};
