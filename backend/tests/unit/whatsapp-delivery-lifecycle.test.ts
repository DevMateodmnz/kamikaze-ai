import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { customersService } from '../../src/modules/customers/service.js';
import { conversationsService } from '../../src/modules/conversations/service.js';
import { messagesService } from '../../src/modules/messages/service.js';
import {
  parseWhatsAppDeliveryStatuses,
  recordOutboundProviderMessage,
  reconcileWhatsAppDeliveryStatus,
  reconcileWhatsAppDeliveryStatuses,
} from '../../src/modules/messages/whatsapp-delivery.js';

let dbAvailable = false;
let conversationId = '';
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const testPhone = `+549381${String(Date.now()).slice(-7)}`;

async function createTrackedOutbound(suffix: string) {
  const message = await messagesService.storeOutboundMessage({
    conversationId,
    content: `[offline fixture ${suffix}]`,
  });
  const wamid = `wamid.OFFLINE_${runId}_${suffix}`;
  await recordOutboundProviderMessage(message.id, wamid, 'OFFLINE_SIMULATION');
  return { message, wamid };
}

function event(providerMessageId: string, status: string, timestamp: string, extra = {}) {
  return {
    providerMessageId,
    status,
    timestamp,
    recipientId: '15550000001',
    rawEvent: { id: providerMessageId, status, timestamp, recipient_id: '15550000001', ...extra },
    ...extra,
  };
}

describe('durable WhatsApp delivery lifecycle', () => {
  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      // A developer DB can be reachable but still use the historical schema.
      await prisma.whatsAppDeliveryEvent.count();
      dbAvailable = true;
      const customer = await customersService.identifyCustomer(testPhone);
      conversationId = (await conversationsService.getOrCreateConversation(customer.id)).id;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.customer.deleteMany({ where: { phone: testPhone } });
  });

  it('parses multiple entries, changes and status objects from the sanitized Meta fixture', () => {
    const fixture = JSON.parse(readFileSync(resolve(
      process.cwd(), '../data/manual-test-fixtures/meta-delivery-statuses.example.json'
    ), 'utf8')) as unknown;
    const statuses = parseWhatsAppDeliveryStatuses(fixture);
    expect(statuses.map((item) => item.status)).toEqual(['sent', 'failed', 'delivered', 'read']);
    expect(statuses[0].conversation).toMatchObject({ origin: { type: 'service' } });
    expect(statuses[1].errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 131047, title: 'Re-engagement message' }),
    ]));
  });

  it('advances sent → delivered → read and retains each evidence event', async () => {
    if (!dbAvailable) return;
    const { message, wamid } = await createTrackedOutbound('progress');
    const results = await reconcileWhatsAppDeliveryStatuses([
      event(wamid, 'sent', '1786723200'),
      event(wamid, 'delivered', '1786723201'),
      event(wamid, 'read', '1786723202'),
    ]);
    expect(results.every((result) => result.aggregateApplied)).toBe(true);
    const stored = await prisma.message.findUnique({ where: { id: message.id } });
    const history = await prisma.whatsAppDeliveryEvent.findMany({ where: { messageId: message.id } });
    expect(stored?.deliveryStatus).toBe('READ');
    expect(history).toHaveLength(3);
  });

  it('makes exact webhook replay idempotent', async () => {
    if (!dbAvailable) return;
    const { message, wamid } = await createTrackedOutbound('duplicate');
    const first = await reconcileWhatsAppDeliveryStatus(event(wamid, 'sent', '1786723210'));
    const replay = await reconcileWhatsAppDeliveryStatus(event(wamid, 'sent', '1786723210'));
    expect(first.duplicate).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(await prisma.whatsAppDeliveryEvent.count({ where: { messageId: message.id } })).toBe(1);
  });

  it('does not regress read when delivered arrives later', async () => {
    if (!dbAvailable) return;
    const { message, wamid } = await createTrackedOutbound('out-of-order');
    await reconcileWhatsAppDeliveryStatus(event(wamid, 'read', '1786723220'));
    const late = await reconcileWhatsAppDeliveryStatus(event(wamid, 'delivered', '1786723219'));
    expect(late.aggregateApplied).toBe(false);
    expect((await prisma.message.findUnique({ where: { id: message.id } }))?.deliveryStatus).toBe('READ');
    expect(await prisma.whatsAppDeliveryEvent.count({ where: { messageId: message.id } })).toBe(2);
  });

  it('stores failed provider evidence and applies the documented terminal policy', async () => {
    if (!dbAvailable) return;
    const { message, wamid } = await createTrackedOutbound('failed');
    const failure = [{ code: 131047, title: 'Fixture failure', message: 'Not delivered', error_data: { details: 'Fixture only' } }];
    await reconcileWhatsAppDeliveryStatus(event(wamid, 'failed', '1786723230', { errors: failure }));
    const lateSent = await reconcileWhatsAppDeliveryStatus(event(wamid, 'sent', '1786723229'));
    const stored = await prisma.message.findUnique({ where: { id: message.id } });
    const evidence = await prisma.whatsAppDeliveryEvent.findFirst({ where: { messageId: message.id, status: 'failed' } });
    expect(stored?.deliveryStatus).toBe('FAILED');
    expect(lateSent.aggregateApplied).toBe(false);
    expect(evidence?.failure).toEqual(failure);
  });

  it('stores unknown future statuses without changing the aggregate', async () => {
    if (!dbAvailable) return;
    const { message, wamid } = await createTrackedOutbound('unknown-status');
    const result = await reconcileWhatsAppDeliveryStatus(event(wamid, 'future_status', '1786723240'));
    expect(result).toMatchObject({ matched: true, aggregateApplied: false });
    expect((await prisma.message.findUnique({ where: { id: message.id } }))?.deliveryStatus).toBe('PENDING');
    const evidence = await prisma.whatsAppDeliveryEvent.findFirst({ where: { messageId: message.id } });
    expect(evidence).toMatchObject({ status: 'future_status', recognized: false });
  });

  it('durably records an unmatched wamid without fabricating domain records', async () => {
    if (!dbAvailable) return;
    const before = await prisma.customer.count();
    const wamid = `wamid.UNMATCHED_${runId}`;
    const result = await reconcileWhatsAppDeliveryStatus(event(wamid, 'delivered', '1786723250'));
    expect(result).toMatchObject({ matched: false, aggregateApplied: false });
    expect(await prisma.customer.count()).toBe(before);
    expect(await prisma.whatsAppDeliveryEvent.findFirst({ where: { providerMessageId: wamid } }))
      .toMatchObject({ messageId: null, status: 'delivered' });
  });
});
