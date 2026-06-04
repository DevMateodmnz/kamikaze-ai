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

  beforeAll(async () => {
    dbAvailable = await checkDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ── Run each fixture through processInboundMessage ─────────────────

  for (const fixture of runnableFixtures) {
    const scenario = fixture._scenario ?? 'unknown';
    const expectedIntent = fixture._expectedIntent!;
    const expectedReplySource = fixture._expectedReplySource;
    const isDuplicate = scenario.includes('duplicate');

    it(`fixture "${scenario}" → intent="${expectedIntent}" replySource="${expectedReplySource}"`, async () => {
      if (!dbAvailable) return;

      // Mock AI classification to return the expected intent with high confidence
      mockedRouter.classifyIntent.mockResolvedValueOnce({
        intent: mapExpectedIntentToAi(fixture._expectedIntent!),
        confidence: 0.9,
      });

      const { processInboundMessage } = await import(
        '../../src/modules/messages/service.js'
      );

      const result = await processInboundMessage({
        whatsappMessageId: fixture.whatsappMessageId,
        from: fixture.from,
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
      expect(trace.aiReplyEnabled).toBe(false);
      expect(trace.aiReplyUsed).toBe(false);

      // intentSource: AI since we mocked classifyIntent successfully
      // Escalation intents that go to 'fallback' via makeDecision still have AI intentSource
      // because classifyIntentWithFallback returned 'ai' source before makeDecision runs
      expect(trace.intentSource).toBe('ai');

      // Verify replySource
      if (expectedReplySource) {
        expect(trace.replySource).toBe(expectedReplySource);
      }

      // Verify no AI reply expansion
      expect(mockedRouter.generateReply).not.toHaveBeenCalled();
    });
  }

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

    // First send — should process normally
    const first = await processInboundMessage({
      whatsappMessageId: dupFixture.whatsappMessageId,
      from: dupFixture.from,
      text: dupFixture.text,
    });
    expect(first.duplicate).toBe(false);
    expect(first.processing).not.toBeNull();

    // Second send — same whatsappMessageId → duplicate
    const second = await processInboundMessage({
      whatsappMessageId: dupFixture.whatsappMessageId,
      from: dupFixture.from,
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
 * Some intents map 1:1, others need the AI Gateway equivalent.
 */
function mapExpectedIntentToAi(intent: string): string {
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

  // Other intents (thanks, goodbye, store_hours, etc.) → general
  return 'general';
}
