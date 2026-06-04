/**
 * Inspect Conversation Fixtures — Real Service Mode
 *
 * Sends conversation fixtures through a running backend instance
 * via POST /api/v1/messages/process and prints inspection summaries.
 *
 * Requires:
 *   - Backend running on http://localhost:3000
 *   - AI_REPLIES_ENABLED=false (default)
 *   - AI_CLASSIFICATION_ENABLED=false (REQUIRED — prevents external AI calls)
 *
 * No real WhatsApp. No external AI provider calls. No network beyond localhost.
 * No secrets in output.
 *
 * Run: AI_CLASSIFICATION_ENABLED=false npx tsx src/scripts/inspect-conversation-fixtures-real.ts
 *   or: npm run inspect:fixtures:real
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
const API_KEY = process.env['INTERNAL_API_KEY'] ?? 'change_me_to_a_secure_random_key';
const PROCESS_URL = `${BASE_URL}/api/v1/messages/process`;
const HEALTH_URL = `${BASE_URL}/health`;

// ---------------------------------------------------------------------------
// Load fixtures
// ---------------------------------------------------------------------------

const fixturePath = resolve(
  process.cwd(),
  '../data/manual-test-fixtures/whatsapp-conversation-flow.example.json'
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

// Only run entries with expected metadata
const runnable = allFixtures.filter((f) => f._expectedIntent);

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function checkBackend(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendFixture(
  fixture: FixtureEntry,
  suffix: string
): Promise<unknown> {
  const body: Record<string, string> = {
    from: fixture.from ?? '+5490000000000',
    text: fixture.text ?? '',
  };

  if (fixture.whatsappMessageId) {
    // Suffix to avoid collision across runs
    body.whatsappMessageId = `${fixture.whatsappMessageId}-real-${suffix}`;
  }

  const res = await fetch(PROCESS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  return res.json();
}

// ---------------------------------------------------------------------------
// Output formatter (inline to avoid ESM import issues with tsx + NodeNext)
// ---------------------------------------------------------------------------

interface InspectionResult {
  processed: boolean;
  duplicate: boolean;
  intent?: string;
  intentSource?: string;
  replySource?: string | null;
  aiIntentUsed?: boolean;
  aiReplyUsed?: boolean;
  aiReplyEnabled?: boolean;
  knowledgeBaseEntryId?: string;
  confidence?: number;
  notes: string[];
}

function formatInspection(raw: unknown, scenario: string): InspectionResult {
  const r = raw as Record<string, unknown> | null;
  if (!r) {
    return {
      processed: false,
      duplicate: false,
      notes: ['No response from backend.'],
    };
  }

  const proc = r['processing'] as Record<string, unknown> | null;
  const trace = (proc?.['trace'] ?? null) as Record<string, unknown> | null;

  // Mask phone — never print real phone numbers
  const fromDisplay = '(masked)';

  return {
    processed: proc !== null,
    duplicate: Boolean(r['duplicate']),
    intent: trace?.['intent'] as string | undefined,
    intentSource: trace?.['intentSource'] as string | undefined,
    replySource: trace?.['replySource'] as string | null | undefined,
    aiIntentUsed: trace?.['aiIntentUsed'] as boolean | undefined,
    aiReplyUsed: trace?.['aiReplyUsed'] as boolean | undefined,
    aiReplyEnabled: trace?.['aiReplyEnabled'] as boolean | undefined,
    knowledgeBaseEntryId: trace?.['knowledgeBaseEntryId'] as string | undefined,
    confidence: trace?.['confidence'] as number | undefined,
    notes: [
      `[real service] ${scenario}`,
      proc ? 'Message fully processed.' : 'Duplicate or stored-only (no processing).',
    ],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Real-Service Fixture Inspection ===\n');

  // SAFETY: require AI classification to be disabled
  if (process.env['AI_CLASSIFICATION_ENABLED'] !== 'false') {
    console.error('ERROR: AI_CLASSIFICATION_ENABLED must be set to "false".');
    console.error('This prevents external AI provider calls during fixture inspection.');
    console.error('');
    console.error('Run with:');
    console.error('  AI_CLASSIFICATION_ENABLED=false npm run inspect:fixtures:real');
    console.error('');
    console.error('Or set it in your .env file:');
    console.error('  AI_CLASSIFICATION_ENABLED=false');
    process.exit(1);
  }

  // Check backend
  console.log(`Checking backend at ${BASE_URL}...`);
  const backendOk = await checkBackend();
  if (!backendOk) {
    console.error('Backend not reachable. Start the backend first:');
    console.error('  cd backend && npm run dev');
    process.exit(1);
  }
  console.log('Backend healthy.\n');

  const suffix = Date.now().toString(36);
  const results: Array<{
    scenario: string;
    from: string;
    expectedIntent?: string;
    expectedReplySource?: string;
    inspection: InspectionResult;
    error?: string;
  }> = [];

  // ── Single-message fixtures (exclude duplicate and multi-turn) ────
  const singleFixtures = runnable.filter(
    (f) =>
      !f._scenario?.includes('duplicate') &&
      !f._scenario?.startsWith('17-') &&
      !f._scenario?.startsWith('18-') &&
      !f._scenario?.startsWith('19-')
  );

  for (const fixture of singleFixtures) {
    const scenario = fixture._scenario ?? 'unknown';
    process.stdout.write(`  ${scenario}... `);
    try {
      const raw = await sendFixture(fixture, suffix);
      const inspection = formatInspection(raw, scenario);
      results.push({
        scenario,
        from: '(masked)',
        expectedIntent: fixture._expectedIntent,
        expectedReplySource: fixture._expectedReplySource,
        inspection,
      });
      console.log('OK');
    } catch (err) {
      results.push({
        scenario,
        from: '(masked)',
        expectedIntent: fixture._expectedIntent,
        expectedReplySource: fixture._expectedReplySource,
        inspection: { processed: false, duplicate: false, notes: [] },
        error: (err as Error).message,
      });
      console.log(`ERROR: ${(err as Error).message}`);
    }
  }

  // ── Duplicate idempotency ────────────────────────────────────────
  const dupFixture = allFixtures.find(
    (f) => f._scenario === '16-duplicate-idempotency'
  );
  if (dupFixture) {
    const scenario = '16-duplicate-idempotency';
    process.stdout.write(`  ${scenario} (first)... `);
    try {
      const first = await sendFixture(dupFixture, suffix);
      results.push({
        scenario: `${scenario}-first`,
        from: '(masked)',
        expectedIntent: dupFixture._expectedIntent,
        expectedReplySource: dupFixture._expectedReplySource,
        inspection: formatInspection(first, scenario),
      });
      console.log('OK');

      process.stdout.write(`  ${scenario} (second)... `);
      const second = await sendFixture(dupFixture, suffix);
      results.push({
        scenario: `${scenario}-second`,
        from: '(masked)',
        inspection: formatInspection(second, scenario),
      });
      console.log('OK');
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }
  }

  // ── Multi-turn ───────────────────────────────────────────────────
  const multiFixtures = [
    allFixtures.find((f) => f._scenario === '17-conversation-sequence-customer-a-msg1'),
    allFixtures.find((f) => f._scenario === '18-conversation-sequence-customer-a-msg2'),
    allFixtures.find((f) => f._scenario === '19-conversation-sequence-customer-a-msg3'),
  ].filter(Boolean) as FixtureEntry[];

  if (multiFixtures.length === 3) {
    process.stdout.write('  multi-turn (3 messages)... ');
    try {
      for (const fixture of multiFixtures) {
        const raw = await sendFixture(fixture, suffix);
        results.push({
          scenario: fixture._scenario ?? 'multi-turn',
          from: '(masked)',
          expectedIntent: fixture._expectedIntent,
          expectedReplySource: fixture._expectedReplySource,
          inspection: formatInspection(raw, fixture._scenario ?? ''),
        });
      }
      console.log('OK');
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }
  }

  // ── Output ───────────────────────────────────────────────────────
  console.log('\n' + JSON.stringify(results, null, 2));

  const processed = results.filter((r) => r.inspection.processed).length;
  const duplicates = results.filter((r) => r.inspection.duplicate).length;
  const escalations = results.filter(
    (r) => r.inspection.replySource === 'escalation'
  ).length;
  const templates = results.filter(
    (r) => r.inspection.replySource === 'template'
  ).length;

  console.log(`\n=== Summary ===`);
  console.log(`Total sent:     ${results.length}`);
  console.log(`Processed:      ${processed}`);
  console.log(`Duplicates:     ${duplicates}`);
  console.log(`Templates:      ${templates}`);
  console.log(`Escalations:    ${escalations}`);
  console.log(`Errors:         ${results.filter((r) => r.error).length}`);
  console.log(`AI replies:     0 (AI_REPLIES_ENABLED=false by default)`);
  console.log(`\nBackend: ${BASE_URL}`);
  console.log(`Note: AI classification may fail offline (fallback to deterministic).`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
