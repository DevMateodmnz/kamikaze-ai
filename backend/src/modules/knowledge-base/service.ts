/**
 * Knowledge Base Service
 *
 * Stores and retrieves store information, FAQs, and policies.
 * Uses Prisma for persistence.
 */

import prisma from '../../config/database.js';
import type { KnowledgeEntry, KnowledgeCategory } from './types.js';
import { AppError } from '../../utils/app-error.js';

export type { KnowledgeEntry, KnowledgeCategory };

// ============================================
// Create
// ============================================

export interface CreateEntryInput {
  category: string;
  question?: string | null;
  answer: string;
  tags?: string[];
  confidence?: number;
  active?: boolean;
}

/**
 * Create a new knowledge base entry.
 * Returns the created entry.
 */
export async function createEntry(input: CreateEntryInput): Promise<KnowledgeEntry> {
  const entry = await prisma.knowledgeBaseEntry.create({
    data: {
      category: input.category,
      question: input.question ?? null,
      answer: input.answer,
      tags: input.tags ?? [],
      confidence: input.confidence ?? 0.5,
      active: input.active ?? true,
    },
  });

  return mapPrismaToEntry(entry);
}

// ============================================
// Read
// ============================================

/**
 * Get entry by ID.
 * Returns null if not found.
 */
export async function getEntryById(id: string): Promise<KnowledgeEntry | null> {
  const entry = await prisma.knowledgeBaseEntry.findUnique({
    where: { id },
  });

  return entry ? mapPrismaToEntry(entry) : null;
}

/**
 * List all entries, optionally filtered by category and/or active status.
 */
export async function listEntries(options?: {
  category?: string;
  active?: boolean;
  limit?: number;
}): Promise<KnowledgeEntry[]> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      ...(options?.category && { category: options.category }),
      ...(options?.active !== undefined && { active: options.active }),
    },
    take: options?.limit,
    orderBy: { createdAt: 'desc' },
  });

  return entries.map(mapPrismaToEntry);
}

/**
 * Get entries by category.
 * Returns only active entries by default.
 */
export async function getEntriesByCategory(
  category: string,
  options?: { activeOnly?: boolean; limit?: number }
): Promise<KnowledgeEntry[]> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      category,
      ...(options?.activeOnly !== false && { active: true }),
    },
    take: options?.limit,
    orderBy: { createdAt: 'desc' },
  });

  return entries.map(mapPrismaToEntry);
}

/**
 * Get entries by tags (OR matching — entry matches if it has ANY of the given tags).
 */
export async function getEntriesByTags(
  tags: string[],
  options?: { activeOnly?: boolean; limit?: number }
): Promise<KnowledgeEntry[]> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      tags: { hasSome: tags },
      ...(options?.activeOnly !== false && { active: true }),
    },
    take: options?.limit,
    orderBy: { createdAt: 'desc' },
  });

  return entries.map(mapPrismaToEntry);
}

/**
 * Search entries by text match on question or answer fields.
 * Simple contains search — no embeddings, no AI.
 */
export async function searchEntries(
  query: string,
  options?: { activeOnly?: boolean; limit?: number }
): Promise<KnowledgeEntry[]> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      OR: [
        { question: { contains: query, mode: 'insensitive' } },
        { answer: { contains: query, mode: 'insensitive' } },
      ],
      ...(options?.activeOnly !== false && { active: true }),
    },
    take: options?.limit,
    orderBy: { createdAt: 'desc' },
  });

  return entries.map(mapPrismaToEntry);
}

/**
 * Get store info entries (store_hours, store_location, payment_methods, shipping categories).
 */
export async function getStoreInfoEntries(): Promise<KnowledgeEntry[]> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      category: {
        in: ['store_info'],
      },
      active: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return entries.map(mapPrismaToEntry);
}

/**
 * Get FAQ entries.
 */
export async function getFaqEntries(): Promise<KnowledgeEntry[]> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      category: { in: ['faq'] },
      active: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return entries.map(mapPrismaToEntry);
}

// ============================================
// Update
// ============================================

export interface UpdateEntryInput {
  category?: string;
  question?: string | null;
  answer?: string;
  tags?: string[];
  confidence?: number;
  active?: boolean;
}

/**
 * Update an existing entry.
 * Throws NOT_FOUND if entry does not exist.
 */
export async function updateEntry(
  id: string,
  patch: UpdateEntryInput
): Promise<KnowledgeEntry> {
  try {
    const entry = await prisma.knowledgeBaseEntry.update({
      where: { id },
      data: {
        ...(patch.category && { category: patch.category }),
        ...(patch.question !== undefined && { question: patch.question }),
        ...(patch.answer && { answer: patch.answer }),
        ...(patch.tags && { tags: patch.tags }),
        ...(patch.confidence !== undefined && { confidence: patch.confidence }),
        ...(patch.active !== undefined && { active: patch.active }),
      },
    });

    return mapPrismaToEntry(entry);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      throw new AppError('Knowledge entry not found', {
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }
    throw error;
  }
}

// ============================================
// Deactivate
// ============================================

/**
 * Deactivate an entry (soft delete — does not remove from DB).
 * Throws NOT_FOUND if entry does not exist.
 */
export async function deactivateEntry(id: string): Promise<KnowledgeEntry> {
  try {
    const entry = await prisma.knowledgeBaseEntry.update({
      where: { id },
      data: { active: false },
    });

    return mapPrismaToEntry(entry);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      throw new AppError('Knowledge entry not found', {
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }
    throw error;
  }
}

// ============================================
// Utility
// ============================================

/**
 * Get verified safe answer for a given intent category.
 * Returns null if no verified active entry exists.
 *
 * Used by decision engine to augment deterministic replies with real KB data.
 */
export async function getVerifiedAnswerForIntent(
  intent: string
): Promise<{ answer: string; entryId: string } | null> {
  // Map intent to KB categories/tags
  const intentToCategoryMap: Record<string, string> = {
    store_hours: 'store_info',
    store_location: 'store_info',
    payment_methods: 'store_info',
    shipping: 'store_info',
    warranty_or_return: 'policy',
  };

  const category = intentToCategoryMap[intent];
  if (!category) return null;

  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      category,
      active: true,
      // Only return entries that are verified (confidence > 0.5)
      confidence: { gt: 0.5 },
    },
    take: 1,
    orderBy: { confidence: 'desc' },
  });

  if (entries.length === 0) return null;

  const entry = entries[0]!;

  // Check for placeholder markers
  if (
    entry.answer.includes('NEEDS_BUSINESS_VERIFICATION') ||
    entry.answer.includes('POR CONFIRMAR') ||
    entry.answer.includes('[PLACEHOLDER]')
  ) {
    return null;
  }

  return { answer: entry.answer, entryId: entry.id };
}

// ============================================
// Mapper
// ============================================

function mapPrismaToEntry(entry: {
  id: string;
  category: string;
  question: string | null;
  answer: string;
  tags: string[];
  confidence: number;
  active: boolean;
}): KnowledgeEntry {
  return {
    id: entry.id,
    category: entry.category as KnowledgeCategory,
    question: entry.question,
    answer: entry.answer,
    tags: entry.tags,
    confidence: entry.confidence,
    active: entry.active,
  };
}

// Export as singleton service object
export const knowledgeBaseService = {
  createEntry,
  getEntryById,
  listEntries,
  getEntriesByCategory,
  getEntriesByTags,
  searchEntries,
  getStoreInfoEntries,
  getFaqEntries,
  updateEntry,
  deactivateEntry,
  getVerifiedAnswerForIntent,
};