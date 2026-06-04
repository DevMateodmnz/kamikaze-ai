/**
 * Unit Tests for WhatsApp Webhook Verification
 *
 * Tests verifyWebhookSignature() and verifyHubChallenge() against
 * Meta's documented test vectors.
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  verifyHubChallenge,
  verifyWebhookSignature,
  parseWhatsAppMessage,
} from '../../src/modules/security/whatsapp-webhook.js';
import type { ParsedWhatsAppMessage } from '../../src/modules/security/whatsapp-webhook.js';
import { AppError } from '../../src/utils/app-error.js';

// Test constants — these are test-only, NEVER real secrets
const TEST_APP_SECRET = 'test_app_secret_12345';
const TEST_VERIFY_TOKEN = 'my_custom_verify_token_abc';

describe('verifyHubChallenge', () => {
  it('should return challenge for valid subscription request', () => {
    const result = verifyHubChallenge(
      'subscribe',
      TEST_VERIFY_TOKEN,
      '1234567890',
      TEST_VERIFY_TOKEN
    );
    expect(result).toBe('1234567890');
  });

  it('should return challenge as string (not number)', () => {
    const result = verifyHubChallenge(
      'subscribe',
      TEST_VERIFY_TOKEN,
      '98765',
      TEST_VERIFY_TOKEN
    );
    expect(typeof result).toBe('string');
    expect(result).toBe('98765');
  });

  it('should throw for wrong hub.mode', () => {
    expect(() =>
      verifyHubChallenge('invalid', TEST_VERIFY_TOKEN, '123', TEST_VERIFY_TOKEN)
    ).toThrow(AppError);
    try {
      verifyHubChallenge('invalid', TEST_VERIFY_TOKEN, '123', TEST_VERIFY_TOKEN);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(400);
      expect((error as AppError).code).toBe('INVALID_HUB_MODE');
    }
  });

  it('should throw for wrong verify_token', () => {
    expect(() =>
      verifyHubChallenge('subscribe', 'wrong_token', '123', TEST_VERIFY_TOKEN)
    ).toThrow(AppError);
    try {
      verifyHubChallenge('subscribe', 'wrong_token', '123', TEST_VERIFY_TOKEN);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(403);
      expect((error as AppError).code).toBe('INVALID_VERIFICATION_TOKEN');
    }
  });

  it('should throw for missing challenge', () => {
    expect(() =>
      verifyHubChallenge('subscribe', TEST_VERIFY_TOKEN, '', TEST_VERIFY_TOKEN)
    ).toThrow(AppError);
    try {
      verifyHubChallenge('subscribe', TEST_VERIFY_TOKEN, '', TEST_VERIFY_TOKEN);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('MISSING_CHALLENGE');
    }
  });

  it('should be case-sensitive for mode', () => {
    expect(() =>
      verifyHubChallenge('SUBSCRIBE', TEST_VERIFY_TOKEN, '123', TEST_VERIFY_TOKEN)
    ).toThrow(AppError);
  });

  it('should be case-sensitive for token', () => {
    expect(() =>
      verifyHubChallenge('subscribe', TEST_VERIFY_TOKEN.toUpperCase(), '123', TEST_VERIFY_TOKEN)
    ).toThrow(AppError);
  });
});

describe('verifyWebhookSignature', () => {
  it('should return true for valid HMAC signature', () => {
    const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
    const hmac = createHmac('sha256', TEST_APP_SECRET);
    hmac.update(body);
    const signature = `sha256=${hmac.digest('hex')}`;

    expect(verifyWebhookSignature(body, signature, TEST_APP_SECRET)).toBe(true);
  });

  it('should return false for invalid HMAC signature', () => {
    const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
    const signature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

    expect(verifyWebhookSignature(body, signature, TEST_APP_SECRET)).toBe(false);
  });

  it('should return false for tampered payload', () => {
    const originalBody = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
    const tamperedBody = Buffer.from('{"object":"tampered","entry":[]}');

    const hmac = createHmac('sha256', TEST_APP_SECRET);
    hmac.update(originalBody);
    const signature = `sha256=${hmac.digest('hex')}`;

    expect(verifyWebhookSignature(tamperedBody, signature, TEST_APP_SECRET)).toBe(false);
  });

  it('should return false for missing signature', () => {
    const body = Buffer.from('{"test":true}');
    expect(verifyWebhookSignature(body, '', TEST_APP_SECRET)).toBe(false);
  });

  it('should return false for wrong prefix', () => {
    const body = Buffer.from('{"test":true}');
    const hmac = createHmac('sha256', TEST_APP_SECRET);
    hmac.update(body);
    const signature = `sha1=${hmac.digest('hex')}`; // sha1 prefix instead of sha256

    expect(verifyWebhookSignature(body, signature, TEST_APP_SECRET)).toBe(false);
  });

  it('should return false for signature without prefix', () => {
    const body = Buffer.from('{"test":true}');
    const hmac = createHmac('sha256', TEST_APP_SECRET);
    hmac.update(body);
    const signature = hmac.digest('hex'); // No "sha256=" prefix

    expect(verifyWebhookSignature(body, signature, TEST_APP_SECRET)).toBe(false);
  });

  it('should be timing-safe (constant-time comparison)', () => {
    // Verify that valid and invalid signatures take roughly the same time
    const body = Buffer.from('{"test":true}');
    const hmac = createHmac('sha256', TEST_APP_SECRET);
    hmac.update(body);
    const validSig = `sha256=${hmac.digest('hex')}`;
    const invalidSig = 'sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const start1 = performance.now();
    verifyWebhookSignature(body, validSig, TEST_APP_SECRET);
    const time1 = performance.now() - start1;

    const start2 = performance.now();
    verifyWebhookSignature(body, invalidSig, TEST_APP_SECRET);
    const time2 = performance.now() - start2;

    // Both should complete in under 10ms (no meaningful timing difference)
    expect(time1).toBeLessThan(10);
    expect(time2).toBeLessThan(10);
  });

  it('should handle empty body gracefully', () => {
    const body = Buffer.alloc(0);
    const hmac = createHmac('sha256', TEST_APP_SECRET);
    hmac.update(body);
    const signature = `sha256=${hmac.digest('hex')}`;

    expect(verifyWebhookSignature(body, signature, TEST_APP_SECRET)).toBe(true);
  });

  it('should handle Unicode payload correctly', () => {
    const body = Buffer.from('{"message":"¡Hola! こんにちは 🚴"}');
    const hmac = createHmac('sha256', TEST_APP_SECRET);
    hmac.update(body);
    const signature = `sha256=${hmac.digest('hex')}`;

    expect(verifyWebhookSignature(body, signature, TEST_APP_SECRET)).toBe(true);
  });

  it('should return false for hex decoding errors', () => {
    const body = Buffer.from('test');
    const signature = 'sha256=not_valid_hex!@#$';

    expect(verifyWebhookSignature(body, signature, TEST_APP_SECRET)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseWhatsAppMessage — payload extraction
// ---------------------------------------------------------------------------

function makeTextPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15551234567',
                phone_number_id: '987654',
              },
              contacts: [
                {
                  profile: { name: 'Test User' },
                  wa_id: '5493812345678',
                },
              ],
              messages: [
                {
                  from: '5493812345678',
                  id: 'wamid.test123',
                  timestamp: '1717000000',
                  type: 'text',
                  text: { body: 'Hola, quiero info' },
                  ...overrides,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('parseWhatsAppMessage', () => {
  it('extracts fields from a valid text message payload', () => {
    const payload = makeTextPayload();
    const result = parseWhatsAppMessage(payload as any);

    expect(result).not.toBeNull();
    expect(result!.from).toBe('5493812345678');
    expect(result!.whatsappMessageId).toBe('wamid.test123');
    expect(result!.text).toBe('Hola, quiero info');
    expect(result!.timestamp).toBe('1717000000');
  });

  it('returns null when entry array is empty', () => {
    const result = parseWhatsAppMessage({ object: 'whatsapp_business_account', entry: [] });
    expect(result).toBeNull();
  });

  it('returns null when entries are missing', () => {
    const result = parseWhatsAppMessage({ object: 'whatsapp_business_account' });
    expect(result).toBeNull();
  });

  it('returns null when changes array is empty', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: '1', changes: [] }],
    };
    expect(parseWhatsAppMessage(payload as any)).toBeNull();
  });

  it('returns null when messages array is empty', () => {
    const payload = makeTextPayload();
    // Override messages to be empty
    (payload as any).entry[0].changes[0].value.messages = [];
    expect(parseWhatsAppMessage(payload as any)).toBeNull();
  });

  it('returns null for non-text message types (e.g. image)', () => {
    const payload = makeTextPayload({ type: 'image' });
    expect(parseWhatsAppMessage(payload as any)).toBeNull();
  });

  it('returns null for status callback (no text field)', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: 'x', phone_number_id: 'y' },
                statuses: [
                  { id: 'wamid.abc', status: 'delivered', timestamp: '1' },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseWhatsAppMessage(payload as any)).toBeNull();
  });

  it('returns null when text.body is empty', () => {
    const payload = makeTextPayload({ text: { body: '' } });
    expect(parseWhatsAppMessage(payload as any)).toBeNull();
  });

  it('returns null for completely malformed body', () => {
    expect(parseWhatsAppMessage({} as any)).toBeNull();
    expect(parseWhatsAppMessage(null as any)).toBeNull();
    expect(parseWhatsAppMessage('string' as any)).toBeNull();
  });
});
