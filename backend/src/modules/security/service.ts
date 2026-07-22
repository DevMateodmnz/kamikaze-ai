/**
 * Security Service
 *
 * Handles security concerns across the application:
 * - API key authentication for internal endpoints
 * - Webhook signature verification (WhatsApp)
 *
 * Phase 1 implementation
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../../utils/app-error.js';

/**
 * Verify internal API key from n8n
 *
 * Checks the X-API-Key header against INTERNAL_API_KEY env var.
 * If the header is missing or doesn't match, throws an AppError.
 *
 * Usage: fastify.addHook('preHandler', verifyApiKey)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify detects async hooks at runtime.
export async function verifyApiKey(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    throw new AppError('INTERNAL_API_KEY not configured', {
      statusCode: 500,
      code: 'SERVER_CONFIG_ERROR',
    });
  }

  if (!apiKey) {
    throw new AppError('Missing X-API-Key header', {
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  if (apiKey !== expectedKey) {
    throw new AppError('Invalid X-API-Key', {
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }
}

/**
 * Verify WhatsApp webhook signature (LIVE implementation)
 *
 * Replaces the scaffold. Delegates to the whatsapp-webhook module.
 */
export { verifyWebhookSignature } from './whatsapp-webhook.js';
