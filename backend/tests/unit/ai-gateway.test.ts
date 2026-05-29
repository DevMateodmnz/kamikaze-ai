/**
 * Unit Tests for AI Gateway Interface
 */

import { describe, it, expect } from 'vitest';
import { aiGatewayRouter } from '../../src/modules/ai-gateway/router.js';
import { AppError } from '../../src/utils/app-error.js';

describe('AI Gateway Router (Scaffold)', () => {
  describe('generateReply', () => {
    it('should throw NotImplemented error', async () => {
      await expect(
        aiGatewayRouter.generateReply({
          userMessage: 'Hola',
          conversationId: 'conv-123',
        })
      ).rejects.toThrow(AppError);

      await expect(
        aiGatewayRouter.generateReply({
          userMessage: 'Hola',
          conversationId: 'conv-123',
        })
      ).rejects.toMatchObject({
        code: 'AI_NOT_IMPLEMENTED',
        statusCode: 501,
      });
    });
  });

  describe('classifyIntent', () => {
    it('should throw NotImplemented error', async () => {
      await expect(
        aiGatewayRouter.classifyIntent({ text: 'Busco una MTB' })
      ).rejects.toThrow(AppError);

      await expect(
        aiGatewayRouter.classifyIntent({ text: 'Busco una MTB' })
      ).rejects.toMatchObject({
        code: 'AI_NOT_IMPLEMENTED',
        statusCode: 501,
      });
    });
  });

  describe('summarize', () => {
    it('should throw NotImplemented error', async () => {
      await expect(
        aiGatewayRouter.summarize({
          conversationId: 'conv-123',
          messages: [
            { role: 'customer', content: 'Hola' },
            { role: 'assistant', content: 'Buenass!' },
          ],
        })
      ).rejects.toThrow(AppError);
    });
  });

  describe('extractLeadData', () => {
    it('should throw NotImplemented error', async () => {
      await expect(
        aiGatewayRouter.extractLeadData({
          conversationId: 'conv-123',
          messages: [
            { role: 'customer', content: 'Me llamo Juan' },
          ],
        })
      ).rejects.toThrow(AppError);
    });
  });
});
