/**
 * WhatsApp Cloud API Outbound Sender
 *
 * Sends text replies to customers via Meta's WhatsApp Cloud API.
 * Disabled by default (WHATSAPP_OUTBOUND_ENABLED=false).
 *
 * Supports a credential-free dry-run mode for local demos and testing.
 * Set WHATSAPP_OUTBOUND_MODE=dry_run to simulate delivery without Meta API.
 * In dry_run mode, sent is false (nothing was actually delivered) and
 * wouldSend provides a safe preview of what would have been sent.
 *
 * Never throws — always returns a result object.
 * Never logs access tokens or phone numbers.
 */

import { validateEnv } from '../../config/env.js';

/** Result of an outbound delivery attempt. */
export interface WhatsAppDeliveryResult {
  /** Whether the message was successfully sent. */
  sent: boolean;
  /** Reason for the result (for trace/debug). */
  reason: 'disabled' | 'config_missing' | 'delivered' | 'delivery_failed' | 'dry_run';
  /** Delivery mode: 'live' for real WhatsApp API, 'dry_run' for simulated. */
  mode?: 'live' | 'dry_run';
  /** Message ID from WhatsApp on success, or a deterministic dry-run ID. */
  waMessageId?: string;
  /** Safe preview of what would have been sent (dry_run mode only). */
  wouldSend?: { to: string; text: string };
}

/**
 * Attempt to send a text reply through the WhatsApp Cloud API.
 *
 * Delivery mode (WHATSAPP_OUTBOUND_MODE):
 *   - live (default): real WhatsApp Cloud API delivery — requires credentials.
 *   - dry_run: simulated delivery — no Meta API call, no credentials needed.
 *     Returns { sent: false, reason: 'dry_run', mode: 'dry_run',
 *              waMessageId: 'dryrun_<ts>', wouldSend: { to, text } }.
 *
 * Safe by default: does nothing unless WHATSAPP_OUTBOUND_ENABLED is 'true'.
 *
 * Message content is the TEXT to send. Phone number is the recipient.
 * Never prints tokens or phone numbers.
 */
export async function attemptWhatsAppDelivery(
  content: string,
  to: string
): Promise<WhatsAppDeliveryResult> {
  // Feature flag gate
  if (!validateEnv().WHATSAPP_OUTBOUND_ENABLED) {
    return { sent: false, reason: 'disabled' };
  }

  // Dry-run mode: credential-free simulated delivery (no Meta API call)
  if (validateEnv().WHATSAPP_OUTBOUND_MODE === 'dry_run') {
    return {
      sent: false,
      reason: 'dry_run',
      mode: 'dry_run',
      waMessageId: `dryrun_${Date.now()}`,
      wouldSend: { to, text: content },
    };
  }

  const e = validateEnv();
  const accessToken = e.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = e.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = e.WHATSAPP_API_VERSION;

  if (!accessToken || !phoneNumberId) {
    return { sent: false, reason: 'config_missing' };
  }

  try {
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: content },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { sent: false, reason: 'delivery_failed', mode: 'live' };
    }

    const json = await response.json() as {
      messages?: Array<{ id?: string }>;
    };
    const waMessageId = json.messages?.[0]?.id;

    return {
      sent: true,
      reason: 'delivered',
      mode: 'live',
      waMessageId,
    };
  } catch {
    return { sent: false, reason: 'delivery_failed', mode: 'live' };
  }
}
