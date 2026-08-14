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
import {
  verifyHubChallenge,
  verifyWebhookSignature,
  parseWhatsAppMessage,
} from './whatsapp-webhook.js';
import { messagesService } from '../messages/service.js';
import { validateEnv } from '../../config/env.js';
import {
  parseWhatsAppDeliveryStatuses,
  reconcileWhatsAppDeliveryStatuses,
} from '../messages/whatsapp-delivery.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify detects async plugins at runtime.
export const securityRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ------------------------------------------------------------------
  // Raw body capture: Meta signs the EXACT bytes before JSON parsing.
  // This preParsing hook runs ONLY for the WhatsApp webhook POST path.
  // It captures the raw Buffer before Fastify parses the body.
  // ------------------------------------------------------------------
  app.addHook('preParsing', async (request: FastifyRequest, _reply, payload) => {
    const url = request.url;
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
    request.rawBody = raw;
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
    const mode = query['hub.mode'] ?? '';
    const token = query['hub.verify_token'] ?? '';
    const challenge = query['hub.challenge'] ?? '';
    const expectedToken = validateEnv().WHATSAPP_VERIFY_TOKEN ?? '';

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
    const env = validateEnv();
    const enabled = env.WHATSAPP_ENABLED;
    if (!enabled) {
      return reply.status(503).send('WhatsApp webhook is disabled');
    }

    // Verify we have the shared secret
    // Extract and validate the signature header
    const signatureHeader = request.headers['x-hub-signature-256'];
    const signature = typeof signatureHeader === 'string' ? signatureHeader : '';
    const unsignedLocalAllowed =
      env.NODE_ENV !== 'production' && env.WHATSAPP_WEBHOOK_ALLOW_UNSIGNED_LOCAL;
    if (!signature && !unsignedLocalAllowed) {
      return reply.status(401).send('Missing X-Hub-Signature-256 header');
    }

    // Get the raw body captured by the preParsing hook
    const rawBody = request.rawBody;
    if (!rawBody || rawBody.length === 0) {
      return reply.status(400).send('Empty request body');
    }

    // A signature, when present, is always verified. Unsigned requests are
    // accepted only outside production behind an explicit test/local flag.
    if (signature) {
      const appSecret = env.WHATSAPP_APP_SECRET ?? '';
      if (!appSecret) {
        return reply.status(500).send('WHATSAPP_APP_SECRET not configured');
      }
      if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
        return reply.status(401).send('Invalid signature');
      }
    }

    // Signature verified — payload is authentic.
    // Parse the JSON body and extract a processable text message.
    // Meta sends the raw JSON as the body; Fastify has already parsed it
    // because the preParsing hook re-emitted the raw bytes as a stream.
    const body = request.body as Record<string, unknown> | null;

    const deliveryStatuses = parseWhatsAppDeliveryStatuses(body);
    if (deliveryStatuses.length > 0) {
      const results = await reconcileWhatsAppDeliveryStatuses(deliveryStatuses);
      for (const result of results) {
        if (!result.matched || !['sent', 'delivered', 'read', 'failed'].includes(result.status)) {
          request.log.warn({
            event: 'whatsapp_delivery_status_observed',
            providerMessageId: result.providerMessageId,
            providerStatus: result.status,
            matched: result.matched,
            duplicate: result.duplicate,
          });
        }
      }
      return reply.status(200).send({
        status: 'delivery_statuses_recorded',
        received: results.length,
        duplicates: results.filter((result) => result.duplicate).length,
        unmatched: results.filter((result) => !result.matched).length,
      });
    }

    const parsed = parseWhatsAppMessage(body);

    // Non-text events (status callbacks, media, interactive, etc.)
    // must still return 200 OK so Meta does not retry.
    if (!parsed) {
      return reply.status(200).send({ status: 'ignored', reason: 'unsupported_event' });
    }

    // Process the message through the existing pipeline
    const result = await messagesService.processInboundMessage({
      whatsappMessageId: parsed.whatsappMessageId,
      from: parsed.from,
      text: parsed.text,
      timestamp: parsed.timestamp,
    });

    return reply.status(200).send({ status: 'processed', ...result });
  });

  // GET /api/v1/security/rate-limit-status (placeholder)
  app.get('/rate-limit-status', () => {
    throw new AppError('Security rate limiting not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });
};
