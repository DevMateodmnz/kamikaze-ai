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
} from '../../src/modules/security/whatsapp-webhook.js';
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
