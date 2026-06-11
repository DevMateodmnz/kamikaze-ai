/**
 * Escalations Service
 *
 * Handles escalation record creation, retrieval, status updates, and resolution.
 * Uses Prisma for persistence. No external notifications yet.
 */

import type { EscalationStatus } from '@prisma/client';
import prisma from '../../config/database.js';
import type { EscalationReason, ClassificationSource } from './types.js';
import { AppError } from '../../utils/app-error.js';

export type { EscalationReason };

export interface CreateEscalationInput {
  conversationId: string;
  reason: string;
  reasonDetail?: string | null;
  suggestedReply?: string | null;
  // ── Operator context (PR-011) — optional for manual escalations ──
  customerPhone?: string;
  customerMessage?: string;
  detectedIntent?: string;
  intentConfidence?: number | null;
  classificationSource?: ClassificationSource;
  summary?: string;
}

export interface EscalationResponse {
  id: string;
  conversationId: string;
  reason: string;
  reasonDetail: string | null;
  suggestedReply: string | null;
  // ── Operator context (PR-011) ──────────────────────────────────
  customerPhone: string;
  customerMessage: string;
  detectedIntent: string;
  intentConfidence: number | null;
  classificationSource: string;
  summary: string;
  status: EscalationStatus;
  notifiedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: Date;
}

export interface ResolveEscalationInput {
  resolvedBy: string;
  resolutionNote?: string;
}

// ============================================
// Create
// ============================================

/**
 * Create a new escalation record with full operator context.
 */
export async function createEscalation(input: CreateEscalationInput): Promise<EscalationResponse> {
  const escalation = await prisma.escalation.create({
    data: {
      conversationId: input.conversationId,
      reason: input.reason,
      reasonDetail: input.reasonDetail ?? null,
      suggestedReply: input.suggestedReply ?? null,
      customerPhone: input.customerPhone ?? '',
      customerMessage: input.customerMessage ?? '',
      detectedIntent: input.detectedIntent ?? '',
      intentConfidence: input.intentConfidence ?? null,
      classificationSource: input.classificationSource ?? '',
      summary: input.summary ?? '',
      status: 'OPEN',
    },
  });

  return mapPrismaToResponse(escalation);
}

// ============================================
// Read
// ============================================

/**
 * Get escalation by ID.
 * Returns null if not found.
 */
export async function getEscalationById(id: string): Promise<EscalationResponse | null> {
  const escalation = await prisma.escalation.findUnique({
    where: { id },
  });

  return escalation ? mapPrismaToResponse(escalation) : null;
}

/**
 * List all escalations, optionally filtered by status.
 */
export async function listEscalations(options?: {
  status?: EscalationStatus;
  limit?: number;
}): Promise<EscalationResponse[]> {
  const escalations = await prisma.escalation.findMany({
    where: {
      ...(options?.status && { status: options.status }),
    },
    take: options?.limit,
    orderBy: { createdAt: 'desc' },
  });

  return escalations.map(mapPrismaToResponse);
}

/**
 * List escalations for a specific conversation.
 */
export async function listEscalationsByConversation(
  conversationId: string
): Promise<EscalationResponse[]> {
  const escalations = await prisma.escalation.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
  });

  return escalations.map(mapPrismaToResponse);
}

/**
 * Get active (open) escalations for admin panel.
 */
export async function getActiveEscalations(): Promise<EscalationResponse[]> {
  const escalations = await prisma.escalation.findMany({
    where: {
      status: {
        in: ['OPEN', 'NOTIFIED', 'IN_PROGRESS'],
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return escalations.map(mapPrismaToResponse);
}

// ============================================
// Update
// ============================================

/**
 * Update escalation status.
 */
export async function updateEscalationStatus(
  id: string,
  status: EscalationStatus
): Promise<EscalationResponse> {
  try {
    const escalation = await prisma.escalation.update({
      where: { id },
      data: { status },
    });

    return mapPrismaToResponse(escalation);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      throw new AppError('Escalation not found', {
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }
    throw error;
  }
}

/**
 * Mark escalation as notified (Discord webhook sent).
 * Sets notifiedAt timestamp and status to NOTIFIED.
 */
export async function markNotified(id: string): Promise<EscalationResponse> {
  try {
    const escalation = await prisma.escalation.update({
      where: { id },
      data: {
        status: 'NOTIFIED',
        notifiedAt: new Date(),
      },
    });

    return mapPrismaToResponse(escalation);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      throw new AppError('Escalation not found', {
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }
    throw error;
  }
}

/**
 * Resolve an escalation.
 * Sets status to RESOLVED, resolution metadata, and resolvedAt timestamp.
 */
export async function resolveEscalation(
  id: string,
  input: ResolveEscalationInput
): Promise<EscalationResponse> {
  try {
    const escalation = await prisma.escalation.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedBy: input.resolvedBy,
        resolutionNote: input.resolutionNote ?? null,
        resolvedAt: new Date(),
      },
    });

    return mapPrismaToResponse(escalation);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      throw new AppError('Escalation not found', {
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }
    throw error;
  }
}

// ============================================
// Mapper
// ============================================

function mapPrismaToResponse(escalation: {
  id: string;
  conversationId: string;
  reason: string;
  reasonDetail: string | null;
  suggestedReply: string | null;
  customerPhone: string;
  customerMessage: string;
  detectedIntent: string;
  intentConfidence: number | null;
  classificationSource: string;
  summary: string;
  status: EscalationStatus;
  notifiedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: Date;
}): EscalationResponse {
  return {
    id: escalation.id,
    conversationId: escalation.conversationId,
    reason: escalation.reason,
    reasonDetail: escalation.reasonDetail,
    suggestedReply: escalation.suggestedReply,
    customerPhone: escalation.customerPhone,
    customerMessage: escalation.customerMessage,
    detectedIntent: escalation.detectedIntent,
    intentConfidence: escalation.intentConfidence,
    classificationSource: escalation.classificationSource,
    summary: escalation.summary,
    status: escalation.status,
    notifiedAt: escalation.notifiedAt,
    resolvedAt: escalation.resolvedAt,
    resolvedBy: escalation.resolvedBy,
    resolutionNote: escalation.resolutionNote,
    createdAt: escalation.createdAt,
  };
}

// Export as singleton service object
export const escalationsService = {
  createEscalation,
  getEscalationById,
  listEscalations,
  listEscalationsByConversation,
  getActiveEscalations,
  updateEscalationStatus,
  markNotified,
  resolveEscalation,
};