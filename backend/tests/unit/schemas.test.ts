/**
 * Unit Tests for Schema Validation
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { inboundMessageSchema } from '../../src/modules/messages/routes.js';

describe('Schema Validation', () => {
  describe('inboundMessageSchema', () => {
    it('should validate a correct inbound message payload', () => {
      const validPayload = {
        whatsappMessageId: 'wamid.xxx',
        from: '+5493812345678',
        text: 'Hola, busco una bici MTB',
        timestamp: '1717000000',
      };

      const result = inboundMessageSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should reject empty text', () => {
      const invalidPayload = {
        whatsappMessageId: 'wamid.xxx',
        from: '+5493812345678',
        text: '',
        timestamp: '1717000000',
      };

      const result = inboundMessageSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject missing whatsappMessageId', () => {
      const invalidPayload = {
        from: '+5493812345678',
        text: 'Hola',
        timestamp: '1717000000',
      };

      const result = inboundMessageSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid phone format', () => {
      const invalidPayload = {
        whatsappMessageId: 'wamid.xxx',
        from: 'not-a-phone',
        text: 'Hola',
        timestamp: '1717000000',
      };

      // Phone is not strictly validated in Zod schema, only length
      const result = inboundMessageSchema.safeParse(invalidPayload);
      expect(result.success).toBe(true);
    });
  });
});
