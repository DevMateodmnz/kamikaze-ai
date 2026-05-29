/**
 * Knowledge Base Module
 *
 * Stores and retrieves store information, FAQs, and policies.
 *
 * Responsibilities:
 * - Store knowledge base entries (store hours, addresses, payment policies, FAQs)
 * - Search relevant entries by query
 * - Retrieve entries by category
 *
 * NOT IMPLEMENTED - This is a scaffold for Phase 2
 */

export { knowledgeBaseService } from './service.js';
export { knowledgeBaseRouter } from './routes.js';
export type { KnowledgeEntry, KnowledgeCategory } from './types.js';
