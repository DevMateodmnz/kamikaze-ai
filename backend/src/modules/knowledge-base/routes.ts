/**
 * Knowledge Base Routes
 *
 * GET /api/v1/knowledge-base - List all entries
 * GET /api/v1/knowledge-base/search?q=... - Search entries
 * GET /api/v1/knowledge-base/category/:category - Get by category
 * GET /api/v1/knowledge-base/tags/:tags - Get by tags (comma-separated)
 * GET /api/v1/knowledge-base/:id - Get single entry
 *
 * Read-only for PR-006. No unauthenticated mutation endpoints.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { knowledgeBaseService } from './service.js';

const querySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  active: z.string().optional().transform((v) => (v === 'false' ? false : v === 'true' ? true : undefined)),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
});

const categorySchema = z.object({
  category: z.string().min(1),
});

const tagsSchema = z.object({
  tags: z.string(),
});

const idSchema = z.object({
  id: z.string().min(1),
});

export { querySchema, categorySchema, tagsSchema, idSchema };

export const knowledgeBaseRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/knowledge-base
  // List all entries, optionally filtered
  app.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            active: { type: 'string' },
            limit: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError('Invalid query parameters', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const entries = await knowledgeBaseService.listEntries({
        category: parsed.data.q ? undefined : parsed.data.category,
        active: parsed.data.active,
        limit: parsed.data.limit,
      });

      return {
        success: true,
        count: entries.length,
        entries,
      };
    }
  );

  // GET /api/v1/knowledge-base/search?q=...
  app.get(
    '/search',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            active: { type: 'string' },
            limit: { type: 'string' },
          },
        },
        required: ['q'],
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success || !parsed.data.q) {
        throw new AppError('Missing search query', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const entries = await knowledgeBaseService.searchEntries(parsed.data.q, {
        activeOnly: parsed.data.active,
        limit: parsed.data.limit,
      });

      return {
        success: true,
        query: parsed.data.q,
        count: entries.length,
        entries,
      };
    }
  );

  // GET /api/v1/knowledge-base/category/:category
  app.get(
    '/category/:category',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            category: { type: 'string' },
          },
          required: ['category'],
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const parsed = categorySchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('Invalid category', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const entries = await knowledgeBaseService.getEntriesByCategory(parsed.data.category);

      return {
        success: true,
        category: parsed.data.category,
        count: entries.length,
        entries,
      };
    }
  );

  // GET /api/v1/knowledge-base/tags/:tags (comma-separated)
  app.get(
    '/tags/:tags',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            tags: { type: 'string' },
          },
          required: ['tags'],
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const parsed = tagsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('Invalid tags', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const tags = parsed.data.tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tags.length === 0) {
        throw new AppError('At least one tag required', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const entries = await knowledgeBaseService.getEntriesByTags(tags);

      return {
        success: true,
        tags,
        count: entries.length,
        entries,
      };
    }
  );

  // GET /api/v1/knowledge-base/:id
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

      const entry = await knowledgeBaseService.getEntryById(parsed.data.id);
      if (!entry) {
        throw new AppError('Knowledge entry not found', {
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }

      return {
        success: true,
        entry,
      };
    }
  );
};