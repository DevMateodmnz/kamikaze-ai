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

  // ── Dry-run mode ─────────────────────────────────────────────────

  it('returns { sent: false, reason: "dry_run", mode: "dry_run" } when WHATSAPP_OUTBOUND_MODE=dry_run', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_OUTBOUND_MODE', 'dry_run');

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('dry_run');
    expect(result.mode).toBe('dry_run');
    expect(result.waMessageId).toBeDefined();
    expect(result.waMessageId).toMatch(/^dryrun_/);
    expect(result.wouldSend).toEqual({ to: '+5490000000000', text: 'Hola' });
  });

  it('dry_run mode does NOT call Meta API (no fetch)', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_OUTBOUND_MODE', 'dry_run');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'token-123');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.mode).toBe('dry_run');
    expect(result.wouldSend).toBeDefined();
  });

  it('dry_run returns unique waMessageId per call', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_OUTBOUND_MODE', 'dry_run');

    const r1 = await attemptWhatsAppDelivery('Hola', '+5490000000000');
    // Small delay to guarantee different timestamp
    await new Promise((r) => setTimeout(r, 2));
    const r2 = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(r1.waMessageId).not.toBe(r2.waMessageId);
    expect(r1.mode).toBe('dry_run');
    expect(r1.wouldSend).toBeDefined();
    expect(r2.mode).toBe('dry_run');
  });

  it('dry_run still respects WHATSAPP_OUTBOUND_ENABLED=false → disabled', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'false');
    vi.stubEnv('WHATSAPP_OUTBOUND_MODE', 'dry_run');

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  it('dry_run does not expose credentials or tokens', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_OUTBOUND_MODE', 'dry_run');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'secret-token-xyz');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');
    const json = JSON.stringify(result);

    expect(json).not.toContain('secret-token-xyz');
    expect(json).not.toContain('Bearer');
    expect(result.wouldSend).toBeDefined();
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
    expect(result.reason).toBe('accepted');
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

  it('live mode returns mode: "live" on success', async () => {
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_OUTBOUND_MODE', 'live');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token-abc');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456789');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [{ id: 'wamid.test123' }],
      }),
    }));

    const result = await attemptWhatsAppDelivery('Hola', '+5490000000000');

    expect(result.sent).toBe(true);
    expect(result.reason).toBe('accepted');
    expect(result.mode).toBe('live');
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
