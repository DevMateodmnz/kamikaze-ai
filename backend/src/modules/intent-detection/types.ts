/**
 * Intent Detection Types
 */

export type Intent =
  | 'greeting'
  | 'thanks'
  | 'goodbye'
  | 'human_request'
  | 'stock_question'
  | 'price_question'
  | 'discount_request'
  | 'warranty_or_return'
  | 'complaint'
  | 'product_interest'
  | 'store_hours'
  | 'store_location'
  | 'payment_methods'
  | 'shipping'
  | 'unknown';

export interface IntentDetectionResult {
  intent: Intent;
  confidence: number;
  matchedKeywords: string[];
}

/**
 * Intent Detection Configuration
 *
 * Keyword-based deterministic detection.
 * Confidence is based on how many keywords matched and their specificity.
 *
 * Limitations:
 * - No semantic understanding
 * - No context awareness
 * - Spanish/Argentine Spanish only
 * - Will not handle typos, slang, or mixed case well
 */
export interface IntentDetectorConfig {
  /** Minimum keyword matches for a confident detection */
  minKeywordMatches: number;
  /** Case insensitive matching */
  caseInsensitive: boolean;
}

export const DEFAULT_CONFIG: IntentDetectorConfig = {
  minKeywordMatches: 1,
  caseInsensitive: true,
};