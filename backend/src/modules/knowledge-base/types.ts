/**
 * Knowledge Base Types
 */

export type KnowledgeCategory = 'store_info' | 'faq' | 'policy' | 'product';

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  question: string | null;
  answer: string;
  tags: string[];
  confidence: number;
  active: boolean;
}
