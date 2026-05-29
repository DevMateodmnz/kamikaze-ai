/**
 * Customers Routes
 *
 * GET /api/v1/customers/:id - Get customer by ID
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../../utils/app-error.js';
import { customersService } from './service.js';

export const customersRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/customers/:id
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

      const customer = await customersService.getCustomerById(id);
      if (!customer) {
        throw new AppError('Customer not found', {
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }

      return customer;
    }
  );
};