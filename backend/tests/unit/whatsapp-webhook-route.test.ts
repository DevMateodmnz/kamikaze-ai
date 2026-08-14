import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  processInboundMessage: vi.fn(),
  reconcileStatuses: vi.fn(),
}));

vi.mock('../../src/modules/messages/service.js', () => ({
  messagesService: { processInboundMessage: mocks.processInboundMessage },
}));

vi.mock('../../src/modules/messages/whatsapp-delivery.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/modules/messages/whatsapp-delivery.js')>();
  return { ...actual, reconcileWhatsAppDeliveryStatuses: mocks.reconcileStatuses };
});

const { buildApp } = await import('../../src/app.js');

const APP_SECRET = 'fixture_app_secret_not_real';
const WEBHOOK_PATH = '/api/v1/security/whatsapp/webhook';

function statusPayload(status = 'sent') {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA_FIXTURE',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          statuses: [{
            id: 'wamid.OFFLINE_ROUTE_FIXTURE',
            status,
            timestamp: '1786723200',
            recipient_id: '15550000001',
          }],
        },
      }],
    }],
  };
}

function signature(raw: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`;
}

describe('WhatsApp webhook route security and dispatch', () => {
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_APP_SECRET', APP_SECRET);
    vi.stubEnv('WHATSAPP_WEBHOOK_ALLOW_UNSIGNED_LOCAL', 'false');
    mocks.processInboundMessage.mockReset();
    mocks.reconcileStatuses.mockReset();
    mocks.reconcileStatuses.mockImplementation(async (statuses: Array<{ providerMessageId: string; status: string }>) =>
      statuses.map((item) => ({
        providerMessageId: item.providerMessageId,
        status: item.status,
        duplicate: false,
        matched: true,
        aggregateApplied: true,
      }))
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it('accepts a valid signed delivery webhook', async () => {
    const raw = JSON.stringify(statusPayload('delivered'));
    const app = buildApp();
    const response = await app.inject({
      method: 'POST', url: WEBHOOK_PATH, payload: raw,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature(raw) },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'delivery_statuses_recorded', received: 1 });
    expect(mocks.reconcileStatuses).toHaveBeenCalledOnce();
  });

  it('rejects an invalid signature in live/production mode', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'POST', url: WEBHOOK_PATH, payload: statusPayload(),
      headers: { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` },
    });
    await app.close();
    expect(response.statusCode).toBe(401);
    expect(mocks.reconcileStatuses).not.toHaveBeenCalled();
  });

  it('allows a missing signature only with the explicit local/test flag', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('WHATSAPP_WEBHOOK_ALLOW_UNSIGNED_LOCAL', 'true');
    const app = buildApp();
    const response = await app.inject({ method: 'POST', url: WEBHOOK_PATH, payload: statusPayload() });
    await app.close();
    expect(response.statusCode).toBe(200);
  });

  it('returns 400 for malformed JSON without dispatching', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('WHATSAPP_WEBHOOK_ALLOW_UNSIGNED_LOCAL', 'true');
    const app = buildApp();
    const response = await app.inject({
      method: 'POST', url: WEBHOOK_PATH, payload: '{"entry":',
      headers: { 'content-type': 'application/json' },
    });
    await app.close();
    expect(response.statusCode).toBe(400);
    expect(mocks.reconcileStatuses).not.toHaveBeenCalled();
  });

  it('keeps existing signed inbound text processing intact', async () => {
    mocks.processInboundMessage.mockResolvedValue({ success: true, duplicate: false });
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { messages: [{
        from: '15550000001', id: 'wamid.INBOUND_FIXTURE', timestamp: '1786723200',
        type: 'text', text: { body: 'Hola' },
      }] } }] }],
    };
    const raw = JSON.stringify(payload);
    const app = buildApp();
    const response = await app.inject({
      method: 'POST', url: WEBHOOK_PATH, payload: raw,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature(raw) },
    });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(mocks.processInboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      whatsappMessageId: 'wamid.INBOUND_FIXTURE', text: 'Hola',
    }));
  });

  it('does not allow the unsigned-local flag to bypass production verification', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WHATSAPP_WEBHOOK_ALLOW_UNSIGNED_LOCAL', 'true');
    const app = buildApp();
    const response = await app.inject({ method: 'POST', url: WEBHOOK_PATH, payload: statusPayload() });
    await app.close();
    expect(response.statusCode).toBe(401);
  });
});
