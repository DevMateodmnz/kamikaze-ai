/**
 * Knowledge Base Module
 *
 * Stores and retrieves store information, FAQs, and policies.
 *
 * Responsibilities:
 * - Store knowledge base entries (store hours, addresses, payment policies, FAQs)
 * - Search relevant entries by query, category, or tags
 * - Retrieve entries with verified data for deterministic replies
 * - Never expose unverified placeholder data to customers
 */

export { knowledgeBaseService } from './service.js';
export { knowledgeBaseRouter } from './routes.js';
export type { KnowledgeEntry, KnowledgeCategory } from './types.js';