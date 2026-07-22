import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { runCustomerPilotDemo } from '../../src/scripts/customer-pilot-demo.js';

describe('customer pilot deterministic demo', () => {
  it('proves the four pilot scenarios and removes generated records', async () => {
    const report = await runCustomerPilotDemo({ print: false });

    expect(report.knownQuestion).toMatchObject({
      passed: true,
      intent: 'store_hours',
      replySource: 'knowledge_base',
      deliveryReason: 'dry_run',
    });
    expect(report.escalation).toMatchObject({
      passed: true,
      intent: 'stock_question',
      emailReason: 'email_disabled',
    });
    expect(report.duplicate).toMatchObject({
      passed: true,
      duplicate: true,
    });
    expect(report.providerFailure).toMatchObject({
      passed: true,
      deliveryReason: 'delivery_failed',
      deliverySent: false,
    });
    expect(report.externalCalls).toEqual({
      ai: 0,
      email: 0,
      n8n: 0,
      metaReal: 0,
      metaInterceptedFailure: 1,
    });

    expect(
      await prisma.message.count({
        where: { whatsappMessageId: { startsWith: 'pilot-' } },
      })
    ).toBe(0);
    expect(
      await prisma.knowledgeBaseEntry.count({
        where: { tags: { has: 'pilot_fixture' } },
      })
    ).toBe(0);
  });
});
