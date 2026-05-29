/**
 * Knowledge Base Service
 *
 * Placeholder service - NOT IMPLEMENTED
 *
 * Will be implemented in Phase 2
 */

import type { KnowledgeEntry, KnowledgeCategory } from './types.js';
import { AppError } from '../../utils/app-error.js';

/**
 * Search relevant knowledge base entries
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function searchRelevant(
  _query: string,
  _limit?: number
): Promise<KnowledgeEntry[]> {
  throw new AppError('Knowledge Base module not implemented', {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}

/**
 * Get entries by category
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function getByCategory(
  _category: KnowledgeCategory,
  _limit?: number
): Promise<KnowledgeEntry[]> {
  throw new AppError('Knowledge Base module not implemented', {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}

/**
 * Get store information (addresses, hours)
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function getStoreInfo(): Promise<KnowledgeEntry[]> {
  throw new AppError('Knowledge Base module not implemented', {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}

/**
 * Get FAQ entries
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function getFaqs(): Promise<KnowledgeEntry[]> {
  throw new AppError('Knowledge Base module not implemented', {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}

// Export as singleton service object
export const knowledgeBaseService = {
  searchRelevant,
  getByCategory,
  getStoreInfo,
  getFaqs,
};
