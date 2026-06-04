/**
 * Unit Tests — WhatsApp Outbound Sender
 *
 * Tests the attemptWhatsAppDelivery function behavior across all states:
 * disabled, config missing, successful delivery, and delivery failure.
 *
 * Uses mocked fetch — no real WhatsApp API calls.
 * No real phone numbers, no real access tokens.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { attemptWhatsAppDelivery } from '../../src/modules/messages/whatsapp-sender.js';

describe('attemptWhatsAppDelivery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // ── Disabled by default ───────────────────────────────────────────

  it('returns { sent: false, reason: "disabled" } when WHATSAPP_OUTBOUND_ENABLED is not true', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'false');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'token-123');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  it('returns disabled when WHATSAPP_OUTBOUND_ENABLED is absent', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', '');

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  // ── Missing config ────────────────────────────────────────────────

  it('returns { sent: false, reason: "config_missing" } when token missing', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('config_missing');
  });

  it('returns config_missing when phone number ID missing', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'token-123');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '');

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('config_missing');
  });

  // ── Successful delivery (mocked) ──────────────────────────────────

  it('sends correct WhatsApp Cloud API request when enabled and configured', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token-abc');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456789');
    vi.stubEnv('WHATSAPP_API_VERSION', 'v21.0');

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messaging_product: 'whatsapp',
        contacts: [{ input: '+5490000000000', wa_id: '5490000000000' }],
        messages: [{ id: 'wamid.test123' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await attemptWhatsAppDelivery('Hola, ¿cómo estás?', '+5490000000000');

    expect(result.sent).toBe(true);
    expect(result.reason).toBe('delivered');
    expect(result.waMessageId).toBe('wamid.test123');

    // Verify the fetch call was correct
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/123456789/messages');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer test-token-abc',
      'Content-Type': 'application/json',
    });

    // Verify payload structure
    const body = JSON.parse(options.body as string);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('+5490000000000');
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('Hola, ¿cómo estás?');
  });

  // ── Delivery failure ──────────────────────────────────────────────

  it('returns delivery_failed when Meta returns non-200', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
    }));

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('delivery_failed');
  });

  it('returns delivery_failed when fetch throws network error', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network error')));

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('delivery_failed');
  });

  it('never throws — caller can always destructure sent and reason', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('boom')));

    // Must not throw
    const result = await attemptWhatsAppDelivery('test', '+5490000000000');
    expect(result).toBeDefined();
    expect(typeof result.sent).toBe('boolean');
    expect(typeof result.reason).toBe('string');
  });

  // ── No secrets in result ─────────────────────────────────────────

  it('does not expose access token in result', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'secret-token-xyz');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.1' }] }),
    }));

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');
    const json = JSON.stringify(result);

    expect(json).not.toContain('secret-token-xyz');
    expect(json).not.toContain('Bearer');
  });
});
