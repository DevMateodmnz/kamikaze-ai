/**
 * Security Service
 *
 * Placeholder service - NOT IMPLEMENTED
 *
 * Will be implemented in Phase 1
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../../utils/app-error.js';

/**
 * Verify internal API key from n8n
 *
 * Usage: fastify.addHook('preHandler', verifyApiKey)
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function verifyApiKey(
  _request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // For now, just pass through - will be implemented properly in Phase 1
  // In Phase 1, this will check X-API-Key header against INTERNAL_API_KEY
}

/**
 * Verify WhatsApp webhook signature
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function verifyWebhookSignature(
  _rawBody: Buffer,
  _signature: string
): Promise<boolean> {
  throw new AppError('Webhook verification not implemented', {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}
