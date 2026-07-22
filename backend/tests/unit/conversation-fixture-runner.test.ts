/**
 * Integration Tests — Conversation Fixture Runner
 *
 * Executes selected conversation fixtures through processInboundMessage
 * and verifies trace metadata matches expected values.
 *
 * No real WhatsApp. No real AI provider. No network calls.
 * DB required (gracefully skipped when unavailable).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Mock aiGatewayRouter before any module imports
vi.mock('../../src/modules/ai-gateway/router.js', () => ({
  aiGatewayRouter: {
    classifyIntent: vi.fn(),
    generateReply: vi.fn(),
    summarize: vi.fn(),
    extractLeadData: vi.fn(),
  },
}));

import { aiGatewayRouter } from '../../src/modules/ai-gateway/router.js';

// ---------------------------------------------------------------------------
// Load fixtures
// ---------------------------------------------------------------------------

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  scriptDir,
  '../../../data/manual-test-fixtures/whatsapp-conversation-flow.example.json'
);

interface FixtureEntry {
  _scenario?: string;
  _expectedIntent?: string;
  _expectedReplySource?: string;
  _runnerNote?: string;
  whatsappMessageId?: string;
  from?: string;
  text?: string;
}

const raw = readFileSync(fixturePath, 'utf-8');
const allFixtures: FixtureEntry[] = JSON.parse(raw);

// Only execute entries with _expectedIntent metadata
const runnableFixtures = allFixtures.filter((f) => f._expectedIntent);

// ---------------------------------------------------------------------------
// DB availability
// ---------------------------------------------------------------------------

import { prisma } from '../../src/config/database.js';

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
// Tests
// ---------------------------------------------------------------------------

describe('Conversation fixture runner', () => {
  const mockedRouter = vi.mocked(aiGatewayRouter);
  let testTimestamp = Date.now();
  const runPhoneSuffix = String(testTimestamp).slice(-6);

  beforeAll(async () => {
    dbAvailable = await checkDb();
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.customer.deleteMany({
        where: { phone: { endsWith: runPhoneSuffix } },
      });
    }
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRouter.classifyIntent.mockReset();
    mockedRouter.generateReply.mockReset();
    mockedRouter.summarize.mockReset();
    mockedRouter.extractLeadData.mockReset();
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ── Run each fixture through processInboundMessage ─────────────────

  for (const [fixtureIndex, fixture] of runnableFixtures.entries()) {
    const scenario = fixture._scenario ?? 'unknown';
    const expectedIntent = fixture._expectedIntent!;
    const expectedReplySource = fixture._expectedReplySource;
    const isDuplicate = scenario.includes('duplicate');

    it(`fixture "${scenario}" → intent="${expectedIntent}" replySource="${expectedReplySource}"`, async () => {
      if (!dbAvailable) return;

      const aiMockIntent = mapExpectedIntentToAi(fixture._expectedIntent!);
      let expectedIntentSource: string;

      if (aiMockIntent) {
        // Intent has a direct AI mapping — mock success
        mockedRouter.classifyIntent.mockResolvedValueOnce({
          intent: aiMockIntent,
          confidence: 0.9,
        });
        expectedIntentSource = 'ai';
      } else {
        // Intent has no AI mapping — mock rejection to force deterministic fallback
        mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('unmappable'));
        expectedIntentSource = 'fallback';
      }

      const { processInboundMessage } = await import(
        '../../src/modules/messages/service.js'
      );

      // Use unique whatsappMessageId per fixture to avoid collision with duplicate scenario
      const uniqueWamid = fixture.whatsappMessageId
        ? `${fixture.whatsappMessageId}-${testTimestamp}`
        : undefined;

      const result = await processInboundMessage({
        whatsappMessageId: uniqueWamid,
        from: `+549100${String(fixtureIndex).padStart(2, '0')}${runPhoneSuffix}`,
        text: fixture.text,
      });

      // Assert processing is present
      expect(result.processing).not.toBeNull();
      if (!result.processing) return;

      const trace = result.processing.trace;
      expect(trace).not.toBeNull();
      if (!trace) return;

      // Verify trace fields match expected metadata
      expect(trace.intent).toBe(expectedIntent);
      expect(trace.intentSource).toBe(expectedIntentSource);
      expect(trace.aiReplyEnabled).toBe(false);
      expect(trace.aiReplyUsed).toBe(false);
      expect(trace.aiIntentUsed).toBe(expectedIntentSource === 'ai');

      // Verify replySource
      if (expectedReplySource) {
        expect(trace.replySource).toBe(expectedReplySource);
      }

      // Verify no AI reply expansion
      expect(mockedRouter.generateReply).not.toHaveBeenCalled();
    });
  }

  // ── Multi-turn conversation ────────────────────────────────────────

  it('processes fixtures 17→18→19 sequentially and accumulates in same conversation', async () => {
    if (!dbAvailable) return;

    const multiFixtures = [
      allFixtures.find((f) => f._scenario === '17-conversation-sequence-customer-a-msg1'),
      allFixtures.find((f) => f._scenario === '18-conversation-sequence-customer-a-msg2'),
      allFixtures.find((f) => f._scenario === '19-conversation-sequence-customer-a-msg3'),
    ];

    // Verify all 3 fixtures exist and represent the same fixture customer.
    expect(multiFixtures.every((f) => f != null)).toBe(true);
    const phones = new Set(multiFixtures.map((f) => f!.from));
    expect(phones.size).toBe(1);

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );
    const runPhone = `+549200000${runPhoneSuffix}`;

    const results: Awaited<ReturnType<typeof processInboundMessage>>[] = [];
    for (const fixture of multiFixtures) {
      const aiMockIntent = mapExpectedIntentToAi(fixture!._expectedIntent!);
      if (aiMockIntent) {
        mockedRouter.classifyIntent.mockResolvedValueOnce({
          intent: aiMockIntent,
          confidence: 0.9,
        });
      } else {
        mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('unmappable'));
      }

      results.push(
        await processInboundMessage({
          from: runPhone,
          text: fixture!.text,
        })
      );
    }

    // All 3 must have processing (no duplicates)
    for (const r of results) {
      expect(r.duplicate).toBe(false);
      expect(r.processing).not.toBeNull();
    }

    // Trace assertions per message
    expect(results[0]!.processing!.trace!.intent).toBe(
      multiFixtures[0]!._expectedIntent
    );
    expect(results[1]!.processing!.trace!.intent).toBe(
      multiFixtures[1]!._expectedIntent
    );
    expect(results[2]!.processing!.trace!.intent).toBe(
      multiFixtures[2]!._expectedIntent
    );

    for (const r of results) {
      const trace = r.processing!.trace!;
      expect(trace.aiReplyEnabled).toBe(false);
      expect(trace.aiReplyUsed).toBe(false);
      expect(trace.replySource).toBe('template');
    }

    // All 3 share the same conversationId (same phone → same conversation)
    const convIds = new Set(results.map((r) => r.conversationId));
    expect(convIds.size).toBe(1);

    // generateReply never called
    expect(mockedRouter.generateReply).not.toHaveBeenCalled();
  });

  // ── Duplicate idempotency ──────────────────────────────────────────

  it('duplicate message returns processing=null on second send', async () => {
    if (!dbAvailable) return;

    const dupFixture = allFixtures.find(
      (f) => f._scenario === '16-duplicate-idempotency'
    );
    if (!dupFixture) return;

    mockedRouter.classifyIntent.mockResolvedValue({
      intent: 'greeting',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );
    const duplicateMessageId = `${dupFixture.whatsappMessageId}-idempotency-${testTimestamp}`;
    const duplicatePhone = `+549300000${runPhoneSuffix}`;

    // First send — should process normally
    const first = await processInboundMessage({
      whatsappMessageId: duplicateMessageId,
      from: duplicatePhone,
      text: dupFixture.text,
    });
    expect(first.duplicate).toBe(false);
    expect(first.processing).not.toBeNull();

    // Second send — same whatsappMessageId → duplicate
    const second = await processInboundMessage({
      whatsappMessageId: duplicateMessageId,
      from: duplicatePhone,
      text: dupFixture.text,
    });
    expect(second.duplicate).toBe(true);
    expect(second.processing).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map deterministic Intent to AI Gateway Intent for the mock.
 * Returns null for intents without a direct AI mapping (forces fallback).
 */
function mapExpectedIntentToAi(intent: string): string | null {
  // Most deterministic intents have the same name in AI Gateway
  const directMap = new Set([
    'greeting', 'product_interest', 'stock_question',
    'discount_request', 'complaint', 'human_request',
  ]);
  if (directMap.has(intent)) return intent;

  // warranty_or_return → warranty
  if (intent === 'warranty_or_return') return 'warranty';
  // unknown → general
  if (intent === 'unknown') return 'general';

  // store_hours, store_location, payment_methods, shipping,
  // price_question, thanks, goodbye → no AI mapping → null (fallback)
  return null;
}
