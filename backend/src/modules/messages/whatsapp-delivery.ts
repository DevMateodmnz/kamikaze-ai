/** Durable WhatsApp Cloud API delivery-status reconciliation. */

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import type { WhatsAppDeliveryMode, WhatsAppDeliveryStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';

const KNOWN_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

export interface ParsedWhatsAppDeliveryStatus {
  providerMessageId: string;
  status: string;
  timestamp?: string;
  recipientId?: string;
  errors?: unknown[];
  conversation?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  rawEvent: Record<string, unknown>;
}

export interface DeliveryStatusResult {
  providerMessageId: string;
  status: string;
  duplicate: boolean;
  matched: boolean;
  aggregateApplied: boolean;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extract every status across all entries, changes and status arrays. */
export function parseWhatsAppDeliveryStatuses(body: unknown): ParsedWhatsAppDeliveryStatus[] {
  if (!isRecord(body) || !Array.isArray(body.entry)) return [];

  const parsed: ParsedWhatsAppDeliveryStatus[] = [];
  for (const entry of body.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value) || !Array.isArray(change.value.statuses)) {
        continue;
      }
      for (const candidate of change.value.statuses) {
        if (!isRecord(candidate)) continue;
        if (typeof candidate.id !== 'string' || candidate.id.length === 0) continue;
        if (typeof candidate.status !== 'string' || candidate.status.length === 0) continue;

        const normalized: ParsedWhatsAppDeliveryStatus = {
          providerMessageId: candidate.id,
          status: candidate.status.toLowerCase(),
          rawEvent: { ...candidate },
        };
        if (typeof candidate.timestamp === 'string') normalized.timestamp = candidate.timestamp;
        if (typeof candidate.recipient_id === 'string') normalized.recipientId = candidate.recipient_id;
        if (Array.isArray(candidate.errors)) normalized.errors = candidate.errors;
        if (isRecord(candidate.conversation)) normalized.conversation = candidate.conversation;
        if (isRecord(candidate.pricing)) normalized.pricing = candidate.pricing;
        parsed.push(normalized);
      }
    }
  }
  return parsed;
}

function providerDate(timestamp?: string): Date | null {
  if (!timestamp || !/^\d+$/.test(timestamp)) return null;
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fingerprint(event: ParsedWhatsAppDeliveryStatus): string {
  // Field order is intentionally fixed so webhook retries hash identically.
  return createHash('sha256').update(JSON.stringify({
    id: event.providerMessageId,
    status: event.status,
    timestamp: event.timestamp ?? null,
    recipientId: event.recipientId ?? null,
    errors: event.errors ?? null,
    conversation: event.conversation ?? null,
    pricing: event.pricing ?? null,
  })).digest('hex');
}

function aggregateStatus(status: string): WhatsAppDeliveryStatus | null {
  switch (status) {
    case 'sent': return 'SENT';
    case 'delivered': return 'DELIVERED';
    case 'read': return 'READ';
    case 'failed': return 'FAILED';
    default: return null;
  }
}

function allowedPrevious(status: WhatsAppDeliveryStatus): WhatsAppDeliveryStatus[] {
  switch (status) {
    case 'SENT': return ['PENDING'];
    case 'DELIVERED': return ['PENDING', 'SENT'];
    case 'READ': return ['PENDING', 'SENT', 'DELIVERED'];
    // Failure is terminal only before positive delivery evidence. A late failed
    // callback is retained but cannot erase DELIVERED or READ.
    case 'FAILED': return ['PENDING', 'SENT'];
    case 'PENDING': return [];
  }
}

/** Attach the wamid returned when Meta accepts an outbound request. */
export async function recordOutboundProviderMessage(
  messageId: string,
  providerMessageId: string,
  mode: WhatsAppDeliveryMode
): Promise<void> {
  await prisma.message.update({
    where: { id: messageId },
    data: {
      whatsappMessageId: providerMessageId,
      deliveryMode: mode,
      deliveryStatus: 'PENDING',
      deliveryStatusAt: new Date(),
    },
  });
}

/** Persist one provider status and advance the aggregate without regressions. */
export async function reconcileWhatsAppDeliveryStatus(
  event: ParsedWhatsAppDeliveryStatus,
  receivedAt = new Date()
): Promise<DeliveryStatusResult> {
  const eventFingerprint = fingerprint(event);
  const knownAggregate = aggregateStatus(event.status);

  const replay = await prisma.whatsAppDeliveryEvent.findUnique({
    where: { eventFingerprint },
    select: { messageId: true, aggregateApplied: true },
  });
  if (replay) {
    return {
      providerMessageId: event.providerMessageId,
      status: event.status,
      duplicate: true,
      matched: replay.messageId !== null,
      aggregateApplied: replay.aggregateApplied,
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const message = await tx.message.findUnique({
        where: { whatsappMessageId: event.providerMessageId },
        select: { id: true, direction: true },
      });
      const matchedMessageId = message?.direction === 'OUTBOUND' ? message.id : null;

      const stored = await tx.whatsAppDeliveryEvent.create({
        data: {
          eventFingerprint,
          providerMessageId: event.providerMessageId,
          messageId: matchedMessageId,
          status: event.status,
          recognized: KNOWN_STATUSES.has(event.status),
          providerTimestamp: providerDate(event.timestamp),
          recipientId: event.recipientId,
          failure: event.errors === undefined ? undefined : event.errors as Prisma.InputJsonValue,
          conversation: event.conversation === undefined ? undefined : event.conversation as Prisma.InputJsonValue,
          pricing: event.pricing === undefined ? undefined : event.pricing as Prisma.InputJsonValue,
          rawEvent: event.rawEvent as Prisma.InputJsonValue,
          receivedAt,
        },
      });

      let aggregateApplied = false;
      if (matchedMessageId && knownAggregate) {
        const advanced = await tx.message.updateMany({
          where: {
            id: matchedMessageId,
            OR: [
              { deliveryStatus: null },
              { deliveryStatus: { in: allowedPrevious(knownAggregate) } },
            ],
          },
          data: {
            deliveryStatus: knownAggregate,
            deliveryStatusAt: providerDate(event.timestamp) ?? receivedAt,
          },
        });
        aggregateApplied = advanced.count === 1;
        if (aggregateApplied) {
          await tx.whatsAppDeliveryEvent.update({
            where: { id: stored.id },
            data: { aggregateApplied: true },
          });
        }
      }

      return {
        providerMessageId: event.providerMessageId,
        status: event.status,
        duplicate: false,
        matched: matchedMessageId !== null,
        aggregateApplied,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.whatsAppDeliveryEvent.findUnique({
        where: { eventFingerprint },
        select: { messageId: true, aggregateApplied: true },
      });
      return {
        providerMessageId: event.providerMessageId,
        status: event.status,
        duplicate: true,
        matched: existing?.messageId !== null && existing?.messageId !== undefined,
        aggregateApplied: existing?.aggregateApplied ?? false,
      };
    }
    throw error;
  }
}

export async function reconcileWhatsAppDeliveryStatuses(
  events: ParsedWhatsAppDeliveryStatus[],
  receivedAt = new Date()
): Promise<DeliveryStatusResult[]> {
  const results: DeliveryStatusResult[] = [];
  for (const event of events) {
    results.push(await reconcileWhatsAppDeliveryStatus(event, receivedAt));
  }
  return results;
}
