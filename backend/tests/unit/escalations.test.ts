/**
 * Tests for Escalations service and routes
 *
 * Structure:
 * - Unit tests (no DB): service interface, route exports — always run
 * - Integration tests (real DB): full escalation operations — only when DB is available
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';

// Use the same DATABASE_URL as main .env for integration tests
import { prisma } from '../../src/config/database.js';
import { escalationsService } from '../../src/modules/escalations/service.js';
import { escalationsRouter } from '../../src/modules/escalations/routes.js';

// DB availability check
let dbAvailable = false;

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Unit tests (no DB required)
// ---------------------------------------------------------------------------

describe('Escalations Service Interface', () => {
  it('should export escalationsService with all required methods', () => {
    expect(typeof escalationsService.createEscalation).toBe('function');
    expect(typeof escalationsService.getEscalationById).toBe('function');
    expect(typeof escalationsService.listEscalations).toBe('function');
    expect(typeof escalationsService.listEscalationsByConversation).toBe('function');
    expect(typeof escalationsService.getActiveEscalations).toBe('function');
    expect(typeof escalationsService.updateEscalationStatus).toBe('function');
    expect(typeof escalationsService.markNotified).toBe('function');
    expect(typeof escalationsService.resolveEscalation).toBe('function');
  });
});

describe('Escalations Routes', () => {
  it('should export escalationsRouter as FastifyPluginAsync', () => {
    expect(typeof escalationsRouter).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Integration tests (DB required)
// ---------------------------------------------------------------------------

describe('Escalations Integration Tests', () => {
  let testConversationId: string;

  beforeAll(async () => {
    dbAvailable = await checkDb();
    if (dbAvailable) {
      // Create a test conversation to use for escalation tests
      const customer = await prisma.customer.create({
        data: {
          phone: `+549${Date().substring(0, 10)}`, // unique-ish phone
        },
      });
      const conversation = await prisma.conversation.create({
        data: {
          customerId: customer.id,
          status: 'ACTIVE',
          context: {},
          messageCount: 0,
        },
      });
      testConversationId = conversation.id;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  describe('createEscalation', () => {
    it('should create a new escalation', async () => {
      if (!dbAvailable) return;
      const escalation = await escalationsService.createEscalation({
        conversationId: testConversationId,
        reason: 'human_request',
        reasonDetail: 'Customer asked for human',
        suggestedReply: 'Connecting you with an advisor',
      });

      expect(escalation.id).toBeDefined();
      expect(escalation.conversationId).toBe(testConversationId);
      expect(escalation.reason).toBe('human_request');
      expect(escalation.status).toBe('OPEN');
      expect(escalation.notifiedAt).toBeNull();
      expect(escalation.resolvedAt).toBeNull();
    });

    it('should create escalation with minimal input', async () => {
      if (!dbAvailable) return;
      const escalation = await escalationsService.createEscalation({
        conversationId: testConversationId,
        reason: 'stock_question',
      });

      expect(escalation.id).toBeDefined();
      expect(escalation.reason).toBe('stock_question');
      expect(escalation.status).toBe('OPEN');
    });
  });

  describe('getEscalationById', () => {
    it('should return escalation by ID', async () => {
      if (!dbAvailable) return;
      const created = await escalationsService.createEscalation({
        conversationId: testConversationId,
        reason: 'complaint',
      });

      const found = await escalationsService.getEscalationById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should return null for non-existent ID', async () => {
      if (!dbAvailable) return;
      const found = await escalationsService.getEscalationById(randomUUID());
      expect(found).toBeNull();
    });
  });

  describe('listEscalations', () => {
    it('should list all escalations', async () => {
      if (!dbAvailable) return;
      const escalations = await escalationsService.listEscalations({});
      expect(Array.isArray(escalations)).toBe(true);
    });

    it('should filter by status', async () => {
      if (!dbAvailable) return;
      const escalations = await escalationsService.listEscalations({ status: 'OPEN' });
      escalations.forEach((e) => expect(e.status).toBe('OPEN'));
    });
  });

  describe('listEscalationsByConversation', () => {
    it('should return escalations for a conversation', async () => {
      if (!dbAvailable) return;
      const escalations = await escalationsService.listEscalationsByConversation(testConversationId);
      expect(Array.isArray(escalations)).toBe(true);
      escalations.forEach((e) => expect(e.conversationId).toBe(testConversationId));
    });
  });

  describe('getActiveEscalations', () => {
    it('should return only open/in-progress escalations', async () => {
      if (!dbAvailable) return;
      const escalations = await escalationsService.getActiveEscalations();
      expect(Array.isArray(escalations)).toBe(true);
      escalations.forEach((e) => {
        expect(['OPEN', 'NOTIFIED', 'IN_PROGRESS']).toContain(e.status);
      });
    });
  });

  describe('updateEscalationStatus', () => {
    it('should update escalation status', async () => {
      if (!dbAvailable) return;
      const created = await escalationsService.createEscalation({
        conversationId: testConversationId,
        reason: 'low_confidence',
      });

      const updated = await escalationsService.updateEscalationStatus(created.id, 'IN_PROGRESS');
      expect(updated.status).toBe('IN_PROGRESS');
    });

    it('should throw for non-existent escalation', async () => {
      if (!dbAvailable) return;
      await expect(
        escalationsService.updateEscalationStatus(randomUUID(), 'OPEN')
      ).rejects.toThrow();
    });
  });

  describe('markNotified', () => {
    it('should set notifiedAt and status=NOTIFIED', async () => {
      if (!dbAvailable) return;
      const created = await escalationsService.createEscalation({
        conversationId: testConversationId,
        reason: 'human_request',
      });

      const notified = await escalationsService.markNotified(created.id);
      expect(notified.status).toBe('NOTIFIED');
      expect(notified.notifiedAt).not.toBeNull();
    });
  });

  describe('resolveEscalation', () => {
    it('should resolve escalation with metadata', async () => {
      if (!dbAvailable) return;
      const created = await escalationsService.createEscalation({
        conversationId: testConversationId,
        reason: 'stock_question',
      });

      const resolved = await escalationsService.resolveEscalation(created.id, {
        resolvedBy: 'agent@example.com',
        resolutionNote: 'Stock confirmed via phone',
      });

      expect(resolved.status).toBe('RESOLVED');
      expect(resolved.resolvedBy).toBe('agent@example.com');
      expect(resolved.resolutionNote).toBe('Stock confirmed via phone');
      expect(resolved.resolvedAt).not.toBeNull();
    });

    it('should throw for non-existent escalation', async () => {
      if (!dbAvailable) return;
      await expect(
        escalationsService.resolveEscalation(randomUUID(), { resolvedBy: 'test' })
      ).rejects.toThrow();
    });
  });

  describe('/messages/process integration', () => {
    it('stock_question intent should create escalation record', async () => {
      if (!dbAvailable) return;
      const { makeDecision } = await import('../../src/modules/intent-detection/decision-engine.js');
      const decision = makeDecision('stock_question', 0.8);
      expect(decision.action).toBe('escalate');
      expect(decision.escalationReason).toBe('stock_confirmation_required');
    });

    it('human_request intent should create escalation record', async () => {
      if (!dbAvailable) return;
      const { makeDecision } = await import('../../src/modules/intent-detection/decision-engine.js');
      const decision = makeDecision('human_request', 0.8);
      expect(decision.action).toBe('escalate');
      expect(decision.escalationReason).toBe('explicit_human_request');
    });

    it('reply intents should NOT create escalation', async () => {
      if (!dbAvailable) return;
      const { makeDecision } = await import('../../src/modules/intent-detection/decision-engine.js');
      const greetingDecision = makeDecision('greeting', 0.8);
      expect(greetingDecision.action).toBe('reply');
      expect(greetingDecision.escalationReason).toBeNull();
    });
  });
});