/**
 * AI Provider Factory
 *
 * Creates AI provider instances based on configuration.
 *
 * NOT IMPLEMENTED - This is a scaffold for Phase 3
 *
 * Usage:
 * const provider = createAiProvider('minimax');
 */

import type { AiProvider, AiProviderName } from './types.js';

/**
 * Throws - implementation pending in Phase 3
 */
export function createAiProvider(name: AiProviderName): AiProvider {
  throw new Error(
    `AI provider '${name}' not implemented. ` +
      'Providers will be implemented in Phase 3 (PR-011).'
  );
}
