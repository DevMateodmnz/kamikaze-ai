/**
 * WhatsApp Webhook Verification
 *
 * Implements Meta WhatsApp Cloud API webhook verification:
 * - GET handler: hub.challenge verification (subscription handshake)
 * - POST handler: HMAC-SHA256 signature validation
 *
 * Specification: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/webhook-setup
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { AppError } from '../../utils/app-error.js';

/**
 * Verify the hub.challenge subscription request.
 *
 * Called when Meta sends a GET request to verify the webhook URL:
 *   GET /webhook?hub.mode=subscribe&hub.verify_token=X&hub.challenge=1234
 *
 * Returns the challenge string if verified, throws AppError otherwise.
 */
export function verifyHubChallenge(
  mode: string,
  token: string,
  challenge: string,
  expectedToken: string
): string {
  if (mode !== 'subscribe') {
    throw new AppError('Invalid hub.mode', {
      statusCode: 400,
      code: 'INVALID_HUB_MODE',
    });
  }

  if (token !== expectedToken) {
    throw new AppError('Invalid hub.verify_token', {
      statusCode: 403,
      code: 'INVALID_VERIFICATION_TOKEN',
    });
  }

  if (!challenge || challenge.length === 0) {
    throw new AppError('Missing hub.challenge', {
      statusCode: 400,
      code: 'MISSING_CHALLENGE',
    });
  }

  return challenge;
}

/**
 * Verify WhatsApp webhook payload signature.
 *
 * Meta signs payloads with HMAC-SHA256 using the App Secret as the key.
 * The header format is: X-Hub-Signature-256: sha256=<hex_digest>
 *
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  appSecret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = signature.slice(7); // Remove "sha256=" prefix

  const hmac = createHmac('sha256', appSecret);
  hmac.update(rawBody);
  const computedDigest = hmac.digest('hex');

  try {
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const computedBuf = Buffer.from(computedDigest, 'hex');

    if (expectedBuf.length !== computedBuf.length) {
      return false;
    }

    return timingSafeEqual(computedBuf, expectedBuf);
  } catch {
    return false;
  }
}
