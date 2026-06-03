/**
 * Security Routes
 *
 * Routes for:
 * - WhatsApp webhook verification (GET/POST)
 * - Rate limiting status (future)
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Readable } from 'stream';
import { AppError } from '../../utils/app-error.js';
import { verifyHubChallenge, verifyWebhookSignature } from './whatsapp-webhook.js';

export const securityRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ------------------------------------------------------------------
  // Raw body capture: Meta signs the EXACT bytes before JSON parsing.
  // This preParsing hook runs ONLY for the WhatsApp webhook POST path.
  // It captures the raw Buffer before Fastify parses the body.
  // ------------------------------------------------------------------
  app.addHook('preParsing', async (request: FastifyRequest, _reply, payload) => {
    const url = request.url || '';
    const isWhatsAppPost =
      request.method === 'POST' &&
      (url === '/api/v1/security/whatsapp/webhook' ||
       url.startsWith('/api/v1/security/whatsapp/webhook?'));
    if (!isWhatsAppPost) return; // Let Fastify handle normally

    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks);
    (request as any).rawBody = raw;
    // Re-emit the raw bytes as a stream so Fastify can still parse the body
    return Readable.from([raw]);
  });

  // ----------------------------------------------------------------
  // GET /api/v1/security/whatsapp/webhook
  // Meta subscription verification (handshake)
  //
  // Meta sends: GET ?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
  // We respond with: 200 Y  (if token matches)
  // ----------------------------------------------------------------
  app.get('/whatsapp/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'] || '';
    const token = query['hub.verify_token'] || '';
    const challenge = query['hub.challenge'] || '';
    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || '';

    try {
      const result = verifyHubChallenge(mode, token, challenge, expectedToken);
      // Meta expects the raw challenge string back, not JSON
      return reply.status(200).send(String(result));
    } catch (error) {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send(error.message);
      }
      throw error;
    }
  });

  // ----------------------------------------------------------------
  // POST /api/v1/security/whatsapp/webhook
  // HMAC-SHA256 signature verification for incoming message payloads.
  //
  // If signature is valid, the raw JSON body is available via
  // request.rawBody for downstream processing.
  //
  // Note: Actual message processing (store, intent detection, AI reply)
  // is handled by POST /api/v1/messages/process. The WhatsApp webhook
  // is the AUTHENTICATION LAYER — it validates Meta's signature before
  // the payload is trusted.
  // ----------------------------------------------------------------
  app.post('/whatsapp/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check if WhatsApp is enabled
    const enabled = process.env.WHATSAPP_ENABLED === 'true';
    if (!enabled) {
      return reply.status(503).send('WhatsApp webhook is disabled');
    }

    // Verify we have the shared secret
    const appSecret = process.env.WHATSAPP_APP_SECRET || '';
    if (!appSecret) {
      return reply.status(500).send('WHATSAPP_APP_SECRET not configured');
    }

    // Extract and validate the signature header
    const signature = (request.headers['x-hub-signature-256'] as string) || '';
    if (!signature) {
      return reply.status(401).send('Missing X-Hub-Signature-256 header');
    }

    // Get the raw body captured by the preParsing hook
    const rawBody = (request as any).rawBody as Buffer | undefined;
    if (!rawBody || rawBody.length === 0) {
      return reply.status(400).send('Empty request body');
    }

    // Verify the HMAC signature
    const isValid = verifyWebhookSignature(rawBody, signature, appSecret);
    if (!isValid) {
      return reply.status(401).send('Invalid signature');
    }

    // Signature verified — payload is authentic
    // The raw body is available on request.rawBody for downstream processing.
    // For now, return success. Message processing integration is a follow-up PR.
    return reply.status(200).send('OK');
  });

  // GET /api/v1/security/rate-limit-status (placeholder)
  app.get('/rate-limit-status', async () => {
    throw new AppError('Security rate limiting not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });
};
