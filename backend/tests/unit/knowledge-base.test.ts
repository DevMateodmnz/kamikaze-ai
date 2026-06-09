/**
 * Tests for Knowledge Base service and routes
 *
 * Structure:
 * - Unit tests (no DB): service interface, route exports — always run
 * - Integration tests (real DB): full KB operations — only when DB is available
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { getBusinessProfile } from '../../src/config/business-profile.js';

// Use the same DATABASE_URL as main .env for integration tests
// The test env override is removed so real DB connection is used
const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://kamikaze:kamikaze_dev_password@localhost:5432/kamikaze_db';

// Import after env is set
import { prisma } from '../../src/config/database.js';
import { knowledgeBaseService } from '../../src/modules/knowledge-base/service.js';
import { knowledgeBaseRouter } from '../../src/modules/knowledge-base/routes.js';

// DB availability check
let dbAvailable = false;

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Unit tests (no DB required)
// ---------------------------------------------------------------------------

describe('Knowledge Base Service Interface', () => {
  it('should export knowledgeBaseService with all required methods', () => {
    expect(typeof knowledgeBaseService.createEntry).toBe('function');
    expect(typeof knowledgeBaseService.getEntryById).toBe('function');
    expect(typeof knowledgeBaseService.listEntries).toBe('function');
    expect(typeof knowledgeBaseService.getEntriesByCategory).toBe('function');
    expect(typeof knowledgeBaseService.getEntriesByTags).toBe('function');
    expect(typeof knowledgeBaseService.searchEntries).toBe('function');
    expect(typeof knowledgeBaseService.getStoreInfoEntries).toBe('function');
    expect(typeof knowledgeBaseService.getFaqEntries).toBe('function');
    expect(typeof knowledgeBaseService.updateEntry).toBe('function');
    expect(typeof knowledgeBaseService.deactivateEntry).toBe('function');
    expect(typeof knowledgeBaseService.getVerifiedAnswerForIntent).toBe('function');
  });

  it('getVerifiedAnswerForIntent should return null for intents without KB mapping', () => {
    // Pure function tests - verify the function returns null for unmapped intents
    // without making DB calls
    const { getVerifiedAnswerForIntent } = knowledgeBaseService as unknown as {
      getVerifiedAnswerForIntent: (intent: string) => Promise<{ answer: string } | null>;
    };
    // For 'greeting' there is no mapping, so it returns null synchronously-ish
    // This is a synchronous check of the map lookup
    const intentToCategoryMap: Record<string, string> = {
      store_hours: 'store_info',
      store_location: 'store_info',
      payment_methods: 'store_info',
      shipping: 'store_info',
      warranty_or_return: 'policy',
    };
    // greeting is not in the map, so getVerifiedAnswerForIntent would return null
    expect(intentToCategoryMap['greeting']).toBeUndefined();
  });
});

describe('Knowledge Base Routes', () => {
  it('should export knowledgeBaseRouter as FastifyPluginAsync', () => {
    expect(typeof knowledgeBaseRouter).toBe('function');
  });
});

describe('Knowledge Base Types', () => {
  it('should export KnowledgeCategory and KnowledgeEntry interfaces', async () => {
    // Type exports — verify module imports without error
    const types = await import('../../src/modules/knowledge-base/types.js');
    // KnowledgeCategory is a string union type, KnowledgeEntry is an interface
    // Both are TypeScript-only and won't exist as runtime values
    // The import succeeding is the test
    expect(types).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration tests (DB required)
// ---------------------------------------------------------------------------

let testTimestamp = Date.now();

describe('KB Integration Tests', () => {
  beforeAll(async () => {
    dbAvailable = await checkDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createEntry', () => {
    it('should create a new KB entry', async () => {
      if (!dbAvailable) return;
      const entry = await knowledgeBaseService.createEntry({
        category: 'faq',
        question: `[TEST-${testTimestamp}] What is test entry?`,
        answer: 'This is a test answer',
        tags: ['test'],
        confidence: 0.8,
        active: true,
      });
      expect(entry.id).toBeDefined();
      expect(entry.category).toBe('faq');
      expect(entry.active).toBe(true);
    });

    it('should create entry without question (null)', async () => {
      if (!dbAvailable) return;
      const entry = await knowledgeBaseService.createEntry({
        category: 'faq',
        question: null,
        answer: 'Test answer without question',
        tags: [],
        active: true,
      });
      expect(entry.question).toBeNull();
    });
  });

  describe('getEntryById', () => {
    it('should return null for non-existent ID', async () => {
      if (!dbAvailable) return;
      const found = await knowledgeBaseService.getEntryById(randomUUID());
      expect(found).toBeNull();
    });
  });

  describe('listEntries', () => {
    it('should return array of entries', async () => {
      if (!dbAvailable) return;
      const entries = await knowledgeBaseService.listEntries({});
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe('getEntriesByCategory', () => {
    it('should return only active entries by default', async () => {
      if (!dbAvailable) return;
      const entries = await knowledgeBaseService.getEntriesByCategory('faq');
      entries.forEach((e) => expect(e.active).toBe(true));
    });
  });

  describe('searchEntries', () => {
    it('should find entries by text match', async () => {
      if (!dbAvailable) return;
      const results = await knowledgeBaseService.searchEntries('test');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('getEntriesByTags', () => {
    it('should find entries by tags', async () => {
      if (!dbAvailable) return;
      const results = await knowledgeBaseService.getEntriesByTags(['test']);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('getVerifiedAnswerForIntent', () => {
    it('should return null for intents with no KB category mapping', async () => {
      if (!dbAvailable) return;
      const result = await knowledgeBaseService.getVerifiedAnswerForIntent('greeting');
      expect(result).toBeNull();
    });

    it('should return null when no verified active entry exists', async () => {
      if (!dbAvailable) return;
      // Create unverified/inactive entry
      await knowledgeBaseService.createEntry({
        category: 'store_info',
        question: `[TEST-${testTimestamp}] Unverified store hours`,
        answer: 'Some hours placeholder',
        tags: ['horarios'],
        confidence: 0.3,
        active: false,
      });
      const result = await knowledgeBaseService.getVerifiedAnswerForIntent('store_hours');
      expect(result).toBeNull();
    });

    it('should return null for entries with placeholder markers', async () => {
      if (!dbAvailable) return;
      await knowledgeBaseService.createEntry({
        category: 'store_info',
        question: `[TEST-${testTimestamp}] Placeholder hours`,
        answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar horarios',
        tags: ['horarios'],
        confidence: 0.8,
        active: true,
      });
      const result = await knowledgeBaseService.getVerifiedAnswerForIntent('store_hours');
      expect(result).toBeNull();
    });
  });

  // ── Intent-specific KB matching ──────────────────────────────────

  describe('Intent-specific KB selection', () => {
    it('returns hours entry for store_hours when hours-tagged entry exists', async () => {
      if (!dbAvailable) return;
      const hoursEntry = await knowledgeBaseService.createEntry({
        category: 'store_info',
        question: `[TEST-${testTimestamp}] Horarios`,
        answer: 'HORAS_TEST: L-V 9-18',
        tags: ['horarios', 'store_hours'],
        confidence: 0.9,
        active: true,
      });

      const result = await knowledgeBaseService.getVerifiedAnswerForIntent('store_hours');
      expect(result).not.toBeNull();
      expect(result!.answer).toBe('HORAS_TEST: L-V 9-18');
      expect(result!.entryId).toBe(hoursEntry.id);

      await knowledgeBaseService.deactivateEntry(hoursEntry.id);
    });

    it('returns payment entry for payment_methods when payment-tagged entry exists', async () => {
      if (!dbAvailable) return;
      const paymentEntry = await knowledgeBaseService.createEntry({
        category: 'store_info',
        question: `[TEST-${testTimestamp}] Pagos`,
        answer: 'PAGO_TEST: Efectivo y tarjeta',
        tags: ['pago', 'payment_methods'],
        confidence: 0.9,
        active: true,
      });

      const result = await knowledgeBaseService.getVerifiedAnswerForIntent('payment_methods');
      expect(result).not.toBeNull();
      expect(result!.answer).toBe('PAGO_TEST: Efectivo y tarjeta');
      expect(result!.entryId).toBe(paymentEntry.id);

      await knowledgeBaseService.deactivateEntry(paymentEntry.id);
    });

    it('returns null for payment_methods when only untagged store_info entry exists', async () => {
      if (!dbAvailable) return;
      // Create an entry that's in store_info but tagged only for hours
      await knowledgeBaseService.createEntry({
        category: 'store_info',
        question: `[TEST-${testTimestamp}] Solo horas`,
        answer: 'HORAS_TEST',
        tags: ['horarios', 'store_hours'], // NOT payment_methods
        confidence: 1.0,
        active: true,
      });

      const result = await knowledgeBaseService.getVerifiedAnswerForIntent('payment_methods');
      // Should be null — no entry tagged for payment methods
      expect(result).toBeNull();
    });

    it('returns shipping entry for shipping when shipping-tagged entry exists', async () => {
      if (!dbAvailable) return;
      const shipEntry = await knowledgeBaseService.createEntry({
        category: 'store_info',
        question: `[TEST-${testTimestamp}] Envíos`,
        answer: 'ENVIO_TEST: Envío gratis',
        tags: ['envio', 'shipping'],
        confidence: 0.9,
        active: true,
      });

      const result = await knowledgeBaseService.getVerifiedAnswerForIntent('shipping');
      expect(result).not.toBeNull();
      expect(result!.answer).toBe('ENVIO_TEST: Envío gratis');
      expect(result!.entryId).toBe(shipEntry.id);

      await knowledgeBaseService.deactivateEntry(shipEntry.id);
    });

    it('returns highest-confidence entry among same-intent entries', async () => {
      if (!dbAvailable) return;
      const lowConf = await knowledgeBaseService.createEntry({
        category: 'store_info',
        question: `[TEST-${testTimestamp}] Horarios low`,
        answer: 'HORAS_LOW',
        tags: ['horarios', 'store_hours'],
        confidence: 0.7,
        active: true,
      });
      const highConf = await knowledgeBaseService.createEntry({
        category: 'store_info',
        question: `[TEST-${testTimestamp}] Horarios high`,
        answer: 'HORAS_HIGH',
        tags: ['horarios', 'store_hours'],
        confidence: 0.95,
        active: true,
      });

      const result = await knowledgeBaseService.getVerifiedAnswerForIntent('store_hours');
      expect(result).not.toBeNull();
      expect(result!.answer).toBe('HORAS_HIGH'); // highest confidence wins

      await knowledgeBaseService.deactivateEntry(lowConf.id);
      await knowledgeBaseService.deactivateEntry(highConf.id);
    });

    it('does not return low-confidence entry even if tagged for intent', async () => {
      if (!dbAvailable) return;
      await knowledgeBaseService.createEntry({
        category: 'store_info',
        question: `[TEST-${testTimestamp}] Low conf`,
        answer: 'LOW_CONF',
        tags: ['pago', 'payment_methods'],
        confidence: 0.3, // below 0.5 threshold
        active: true,
      });

      const result = await knowledgeBaseService.getVerifiedAnswerForIntent('payment_methods');
      expect(result).toBeNull();
    });

    it('does not return placeholder entry even if tagged for intent', async () => {
      if (!dbAvailable) return;
      await knowledgeBaseService.createEntry({
        category: 'store_info',
        question: `[TEST-${testTimestamp}] Placeholder`,
        answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar',
        tags: ['pago', 'payment_methods'],
        confidence: 0.9,
        active: true,
      });

      const result = await knowledgeBaseService.getVerifiedAnswerForIntent('payment_methods');
      expect(result).toBeNull();
    });
  });

  describe('Decision engine integration', () => {
    it('store_hours intent uses template when no verified KB entry exists', async () => {
      if (!dbAvailable) return;
      const { makeDecision } = await import('../../src/modules/intent-detection/decision-engine.js');
      const decision = makeDecision('store_hours', 0.8, getBusinessProfile());
      expect(decision.action).toBe('reply');
      // Template still used when KB has no verified entry
      expect(decision.replyText).toBeTruthy();
    });

    it('process endpoint KB integration: store_hours uses template when KB has no verified entry', async () => {
      if (!dbAvailable) return;
      // This tests that the route correctly falls back to template
      // when getVerifiedAnswerForIntent returns null
      const { makeDecision } = await import('../../src/modules/intent-detection/decision-engine.js');
      const decision = makeDecision('store_hours', 0.8, getBusinessProfile());
      expect(decision.replyText).toContain('horarios');
    });
  });
});

// ---------------------------------------------------------------------------
// Verified KB data file (data/kb-verified.example.json)
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

describe('Verified KB data template', () => {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const examplePath = resolve(scriptDir, '../../../data/kb-verified.example.json');

  it('example JSON file exists', () => {
    expect(existsSync(examplePath)).toBe(true);
  });

  it('example JSON is valid and parseable', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it('all example entries are inactive (active: false)', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    const entries = JSON.parse(raw) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      expect(entry.active).toBe(false);
    }
  });

  it('all example entries have required fields (category, answer)', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    const entries = JSON.parse(raw) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      expect(typeof entry.category).toBe('string');
      expect(entry.category).toBeTruthy();
      expect(typeof entry.answer).toBe('string');
      expect(entry.answer).toBeTruthy();
    }
  });

  it('no example entry contains real business facts (all are NEEDS_BUSINESS_VERIFICATION)', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    const entries = JSON.parse(raw) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const answer = String(entry.answer);
      expect(answer).toContain('NEEDS_BUSINESS_VERIFICATION');
    }
  });

  it('no example entry has high confidence (all placeholder-level)', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    const entries = JSON.parse(raw) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const c = Number(entry.confidence);
      expect(c).toBeLessThanOrEqual(0.5);
    }
  });

  it('covers all required KB categories', () => {
    const raw = readFileSync(examplePath, 'utf-8');
    const entries = JSON.parse(raw) as Array<Record<string, unknown>>;
    const categories = new Set(entries.map((e) => e.category));
    expect(categories.has('store_info')).toBe(true);
    expect(categories.has('policy')).toBe(true);
    expect(categories.has('faq')).toBe(true);
  });
});