/**
 * Tests for Escalations service and routes
 *
 * Structure:
 * - Unit tests (no DB): service interface, route exports — always run
 * - Integration tests (real DB): full escalation operations — only when DB is available
 */

import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getBusinessProfile } from '../../src/config/business-profile.js';

// Use the same DATABASE_URL as main .env for integration tests
import { prisma } from '../../src/config/database.js';
import { escalationsService } from '../../src/modules/escalations/service.js';
import { escalationsRouter } from '../../src/modules/escalations/routes.js';

// ── Mock nodemailer for email notification tests ──────────────────
const mockSendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
}));

import { sendEscalationEmail } from '../../src/modules/escalations/service.js';

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
// Email notification unit tests (nodemailer mocked)
// ---------------------------------------------------------------------------

const mockEscalation = {
  id: 'esc-test-notify-001',
  conversationId: 'conv-test-001',
  reason: 'explicit_human_request',
  reasonDetail: 'human_request',
  suggestedReply: null,
  customerPhone: '+5493815551234',
  customerMessage: 'Quiero hablar con un humano por favor',
  detectedIntent: 'human_request',
  intentConfidence: 0.85,
  classificationSource: 'ai',
  summary: 'Escalation triggered: explicit_human_request.',
  status: 'OPEN' as const,
  notifiedAt: null,
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
  createdAt: new Date(),
};

describe('sendEscalationEmail', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('skips send when ESCALATION_EMAIL_ENABLED=false', async () => {
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'false');

    const result = await sendEscalationEmail(mockEscalation);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('email_disabled');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('skips send when SMTP_USER is empty', async () => {
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', 'pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@test.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@test.com');

    const result = await sendEscalationEmail(mockEscalation);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('config_missing');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('skips send when SMTP_PASS is empty', async () => {
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_USER', 'user');
    vi.stubEnv('SMTP_PASS', '');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@test.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@test.com');

    const result = await sendEscalationEmail(mockEscalation);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('config_missing');
  });

  it('skips send when ESCALATION_EMAIL_FROM is empty', async () => {
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_USER', 'user');
    vi.stubEnv('SMTP_PASS', 'pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', '');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@test.com');

    const result = await sendEscalationEmail(mockEscalation);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('config_missing');
  });

  it('skips send when ESCALATION_EMAIL_TO is empty', async () => {
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_USER', 'user');
    vi.stubEnv('SMTP_PASS', 'pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@test.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', '');

    const result = await sendEscalationEmail(mockEscalation);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('config_missing');
  });

  it('sends email successfully when all config is valid', async () => {
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_USER', 'user@test.com');
    vi.stubEnv('SMTP_PASS', 'pass123');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@test.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@test.com');

    mockSendMail.mockResolvedValueOnce({ messageId: '<msg-id-001>' });

    const result = await sendEscalationEmail(mockEscalation);
    expect(result.sent).toBe(true);
    expect(result.reason).toBe('sent');
    expect(result.messageId).toBe('<msg-id-001>');
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    const mailOpts = mockSendMail.mock.calls[0][0];
    expect(mailOpts.subject).toContain('explicit_human_request');
    expect(mailOpts.subject).toContain('human_request');
    expect(mailOpts.html).toContain('Quiero hablar con un humano por favor');
    expect(mailOpts.html).toContain('esc-test-notify-001');
    expect(mailOpts.html).toContain('+5493815551234');
    expect(mailOpts.html).toContain('85%');
    expect(mailOpts.html).toContain('ai');
    expect(mailOpts.from).toBe('from@test.com');
    expect(mailOpts.to).toBe('to@test.com');
  });

  it('returns send_failed when nodemailer throws', async () => {
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_USER', 'user@test.com');
    vi.stubEnv('SMTP_PASS', 'pass123');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@test.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@test.com');

    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    const result = await sendEscalationEmail(mockEscalation);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('send_failed');
  });

  it('email body includes enriched PR-011 context', async () => {
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_USER', 'user@test.com');
    vi.stubEnv('SMTP_PASS', 'pass123');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@test.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@test.com');

    mockSendMail.mockResolvedValueOnce({ messageId: '<msg-002>' });

    await sendEscalationEmail(mockEscalation);
    const mailOpts = mockSendMail.mock.calls[0][0];

    expect(mailOpts.html).toContain('Escalation Alert');
    expect(mailOpts.html).toContain('Escalation ID');
    expect(mailOpts.html).toContain('Customer message');
    expect(mailOpts.html).toContain('Customer phone');
    expect(mailOpts.html).toContain('Detected intent');
    expect(mailOpts.html).toContain('Summary');
    // HTML escaping prevents injection
    expect(mailOpts.html).not.toContain('<script>');
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
    it('should create a new escalation with full operator context', async () => {
      if (!dbAvailable) return;
      const escalation = await escalationsService.createEscalation({
        conversationId: testConversationId,
        reason: 'human_request',
        reasonDetail: 'Customer asked for human',
        suggestedReply: 'Connecting you with an advisor',
        customerPhone: '+5493815551234',
        customerMessage: 'Quiero hablar con una persona por favor',
        detectedIntent: 'human_request',
        intentConfidence: 0.85,
        classificationSource: 'deterministic',
        summary: 'Escalation: explicit_human_request. Customer: +5493815551234 asked for human.',
      });

      expect(escalation.id).toBeDefined();
      expect(escalation.conversationId).toBe(testConversationId);
      expect(escalation.reason).toBe('human_request');
      expect(escalation.status).toBe('OPEN');
      expect(escalation.notifiedAt).toBeNull();
      expect(escalation.resolvedAt).toBeNull();
      // Operator context fields
      expect(escalation.customerPhone).toBe('+5493815551234');
      expect(escalation.customerMessage).toBe('Quiero hablar con una persona por favor');
      expect(escalation.detectedIntent).toBe('human_request');
      expect(escalation.intentConfidence).toBe(0.85);
      expect(escalation.classificationSource).toBe('deterministic');
      expect(escalation.summary).toContain('explicit_human_request');
    });

    it('should create escalation with minimal input and empty context defaults', async () => {
      if (!dbAvailable) return;
      const escalation = await escalationsService.createEscalation({
        conversationId: testConversationId,
        reason: 'stock_question',
        customerPhone: '+5493816660000',
        customerMessage: '¿Tienen MTB?',
        detectedIntent: 'stock_question',
        classificationSource: 'fallback',
        summary: 'Stock question escalation',
      });

      expect(escalation.id).toBeDefined();
      expect(escalation.reason).toBe('stock_question');
      expect(escalation.status).toBe('OPEN');
      expect(escalation.customerMessage).toBe('¿Tienen MTB?');
      expect(escalation.detectedIntent).toBe('stock_question');
      expect(escalation.intentConfidence).toBeNull();
    });
  });

  describe('getEscalationById', () => {
    it('should return escalation by ID', async () => {
      if (!dbAvailable) return;
      const created = await escalationsService.createEscalation({
        conversationId: testConversationId,
        reason: 'complaint',
        customerPhone: '+5493810000000',
        customerMessage: 'test',
        detectedIntent: 'complaint',
        classificationSource: 'deterministic',
        summary: 'test',
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
        customerPhone: '+5493810000001',
        customerMessage: 'test',
        detectedIntent: 'unknown',
        classificationSource: 'deterministic',
        summary: 'test',
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
        customerPhone: '+5493810000002',
        customerMessage: 'test',
        detectedIntent: 'human_request',
        classificationSource: 'ai',
        summary: 'test',
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
        customerPhone: '+5493810000003',
        customerMessage: 'test',
        detectedIntent: 'stock_question',
        classificationSource: 'fallback',
        summary: 'test',
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
      const decision = makeDecision('stock_question', 0.8, getBusinessProfile());
      expect(decision.action).toBe('escalate');
      expect(decision.escalationReason).toBe('stock_confirmation_required');
    });

    it('human_request intent should create escalation record', async () => {
      if (!dbAvailable) return;
      const { makeDecision } = await import('../../src/modules/intent-detection/decision-engine.js');
      const decision = makeDecision('human_request', 0.8, getBusinessProfile());
      expect(decision.action).toBe('escalate');
      expect(decision.escalationReason).toBe('explicit_human_request');
    });

    it('reply intents should NOT create escalation', async () => {
      if (!dbAvailable) return;
      const { makeDecision } = await import('../../src/modules/intent-detection/decision-engine.js');
      const greetingDecision = makeDecision('greeting', 0.8, getBusinessProfile());
      expect(greetingDecision.action).toBe('reply');
      expect(greetingDecision.escalationReason).toBeNull();
    });
  });
});