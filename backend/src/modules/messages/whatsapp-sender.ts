/**
 * WhatsApp Cloud API Outbound Sender
 *
 * Sends text replies to customers via Meta's WhatsApp Cloud API.
 * Disabled by default (WHATSAPP_OUTBOUND_ENABLED=false).
 *
 * Never throws — always returns a result object.
 * Never logs access tokens or phone numbers.
 */

/** Result of an outbound delivery attempt. */
export interface WhatsAppDeliveryResult {
  /** Whether the message was successfully sent to WhatsApp. */
  sent: boolean;
  /** Reason for the result (for trace/debug). */
  reason: 'disabled' | 'config_missing' | 'delivered' | 'delivery_failed';
  /** WhatsApp message ID from Meta on success. */
  waMessageId?: string;
}

/**
 * Attempt to send a text reply through the WhatsApp Cloud API.
 *
 * Safe by default: does nothing unless WHATSAPP_OUTBOUND_ENABLED is 'true'
 * AND required credentials are configured.
 *
 * Message content is the TEXT to send. Phone number is the recipient.
 * Never prints tokens or phone numbers.
 */
export async function attemptWhatsAppDelivery(
  content: string,
  to: string
): Promise<WhatsAppDeliveryResult> {
  // Feature flag gate
  if (process.env['WHATSAPP_OUTBOUND_ENABLED'] !== 'true') {
    return { sent: false, reason: 'disabled' };
  }

  const accessToken = process.env['WHATSAPP_ACCESS_TOKEN'];
  const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
  const apiVersion = process.env['WHATSAPP_API_VERSION'] ?? 'v21.0';

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
      return { sent: false, reason: 'delivery_failed' };
    }

    const json = await response.json() as {
      messages?: Array<{ id?: string }>;
    };
    const waMessageId = json.messages?.[0]?.id;

    return {
      sent: true,
      reason: 'delivered',
      waMessageId,
    };
  } catch {
    return { sent: false, reason: 'delivery_failed' };
  }
}
