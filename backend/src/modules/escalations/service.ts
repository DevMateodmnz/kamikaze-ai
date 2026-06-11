/**
 * Escalations Service
 *
 * Handles escalation record creation, retrieval, status updates, and resolution.
 * Uses Prisma for persistence. Email notification via nodemailer (PR-012).
 */

import type { EscalationStatus } from '@prisma/client';
import { createTransport } from 'nodemailer';
import prisma from '../../config/database.js';
import { validateEnv } from '../../config/env.js';
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
// Email Notification (PR-012)
// ============================================

export interface EmailNotificationResult {
  /** Whether the email was accepted by the SMTP server. */
  sent: boolean;
  /** Reason for the outcome. */
  reason: 'sent' | 'email_disabled' | 'config_missing' | 'send_failed';
  /** SMTP message ID on success. */
  messageId?: string;
}

/**
 * Attempt to notify the operator by email about a new escalation.
 *
 * Never throws — escalation creation must not be blocked by email failure.
 * Returns a structured result so callers can log or trace the outcome.
 *
 * Gating (checked in order):
 * 1. ESCALATION_EMAIL_ENABLED  → false: skip with reason 'email_disabled'
 * 2. SMTP credentials present   → missing: skip with reason 'config_missing'
 * 3. Send via nodemailer        → failure: return 'send_failed'
 */
export async function sendEscalationEmail(
  escalation: EscalationResponse
): Promise<EmailNotificationResult> {
  const env = validateEnv();

  // 1. Feature gate
  if (!env.ESCALATION_EMAIL_ENABLED) {
    return { sent: false, reason: 'email_disabled' };
  }

  // 2. Credential check
  if (!env.SMTP_USER || !env.SMTP_PASS || !env.ESCALATION_EMAIL_FROM || !env.ESCALATION_EMAIL_TO) {
    return { sent: false, reason: 'config_missing' };
  }

  // 3. Build email and attempt send
  const subject = `[Kamikaze AI] Escalation: ${escalation.reason} — ${escalation.detectedIntent || 'unknown'}`;
  const bodyHtml = buildEscalationEmailHtml(escalation);

  const transporter = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  try {
    const info = await transporter.sendMail({
      from: env.ESCALATION_EMAIL_FROM,
      to: env.ESCALATION_EMAIL_TO,
      subject,
      html: bodyHtml,
    });
    return { sent: true, reason: 'sent', messageId: info.messageId };
  } catch {
    return { sent: false, reason: 'send_failed' };
  }
}

/**
 * Build a human-readable HTML email body from escalation context.
 * Includes enriched PR-011 fields so the operator can act immediately.
 */
function buildEscalationEmailHtml(escalation: EscalationResponse): string {
  const confidenceStr = escalation.intentConfidence != null
    ? `${(escalation.intentConfidence * 100).toFixed(0)}%`
    : 'n/a';

  // Only include summary paragraph when customer message exists (manual escalations may lack it)
  const messageBlock = escalation.customerMessage
    ? `<p><strong>Customer message:</strong><br/><em>${escapeHtml(escalation.customerMessage)}</em></p>`
    : '';

  // Include AI-suggested reply when present (PR-014)
  const suggestedReplyBlock = escalation.suggestedReply
    ? `<hr/>
<p><strong>💬 AI-Suggested Reply (draft — review before sending):</strong></p>
<blockquote style="background:#f5f5f5;padding:10px;border-left:3px solid #2196F3;">
${escapeHtml(escalation.suggestedReply)}
</blockquote>`
    : '';

  return `<!DOCTYPE html>
<html><body style="font-family: sans-serif; max-width: 600px;">
<h2>Kamikaze AI — Escalation Alert</h2>
<p>A new escalation requires your attention.</p>
<hr/>
<table>
<tr><td><strong>Escalation ID</strong></td><td>${escapeHtml(escalation.id)}</td></tr>
<tr><td><strong>Reason</strong></td><td>${escapeHtml(escalation.reason)}</td></tr>
<tr><td><strong>Detected intent</strong></td><td>${escapeHtml(escalation.detectedIntent || 'n/a')}</td></tr>
<tr><td><strong>Confidence</strong></td><td>${confidenceStr} (${escapeHtml(escalation.classificationSource || 'n/a')})</td></tr>
<tr><td><strong>Customer phone</strong></td><td>${escapeHtml(escalation.customerPhone || 'n/a')}</td></tr>
<tr><td><strong>Summary</strong></td><td>${escapeHtml(escalation.summary || 'n/a')}</td></tr>
</table>
${messageBlock}
${suggestedReplyBlock}
<hr/>
<p style="color: #666; font-size: 0.9em;">This is an automated notification from Kamikaze AI. Reply to the customer directly — do not reply to this email.</p>
</body></html>`;
}

/** Minimal HTML escaping to prevent injection in email bodies. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  sendEscalationEmail,
  getEscalationById,
  listEscalations,
  listEscalationsByConversation,
  getActiveEscalations,
  updateEscalationStatus,
  markNotified,
  resolveEscalation,
};