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
import { request } from 'http';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
const API_KEY = process.env['INTERNAL_API_KEY'] ?? 'change_me_to_a_secure_random_key';
const { hostname, port } = new URL(BASE_URL);
const API_PORT = parseInt(port || '3000', 10);

// ---------------------------------------------------------------------------
// HTTP helpers (using Node.js http module — fetch() may fail on localhost)
// ---------------------------------------------------------------------------

function httpRequest(
  method: string,
  path: string,
  body?: string
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname,
        port: API_PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
          ...(body ? { 'Content-Length': Buffer.byteLength(body).toString() } : {}),
        },
        timeout: 10_000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: { raw: data } });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function checkBackend(): Promise<boolean> {
  try {
    const { status } = await httpRequest('GET', '/health');
    return status === 200;
  } catch {
    return false;
  }
}

async function sendFixture(
  fixture: { whatsappMessageId?: string; from?: string; text?: string },
  suffix: string
): Promise<unknown> {
  const bodyObj: Record<string, string> = {
    whatsappMessageId: fixture.whatsappMessageId
      ? `${fixture.whatsappMessageId}-real-${suffix}`
      : `fixture-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
    from: fixture.from ?? '+5490000000000',
    text: fixture.text ?? '',
  };
  const { data } = await httpRequest('POST', '/api/v1/messages/process', JSON.stringify(bodyObj));
  return data;
}

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
const runnable = allFixtures.filter((f) => f._expectedIntent);

// ---------------------------------------------------------------------------
// Output formatter
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
  outboundDelivery?: {
    attempted: boolean;
    sent: boolean;
    reason: string;
    waMessageId?: string;
  };
  notes: string[];
}

function formatInspection(raw: unknown, scenario: string): InspectionResult {
  const r = raw as Record<string, unknown> | null;
  if (!r) {
    return { processed: false, duplicate: false, notes: ['No response from backend.'] };
  }
  const proc = r['processing'] as Record<string, unknown> | null;
  const trace = (proc?.['trace'] ?? null) as Record<string, unknown> | null;
  const od = trace?.['outboundDelivery'] as Record<string, unknown> | undefined;
  return {
    processed: proc != null,
    duplicate: Boolean(r['duplicate']),
    intent: trace?.['intent'] as string | undefined,
    intentSource: trace?.['intentSource'] as string | undefined,
    replySource: trace?.['replySource'] as string | null | undefined,
    aiIntentUsed: trace?.['aiIntentUsed'] as boolean | undefined,
    aiReplyUsed: trace?.['aiReplyUsed'] as boolean | undefined,
    aiReplyEnabled: trace?.['aiReplyEnabled'] as boolean | undefined,
    knowledgeBaseEntryId: trace?.['knowledgeBaseEntryId'] as string | undefined,
    confidence: trace?.['confidence'] as number | undefined,
    outboundDelivery: od ? {
      attempted: Boolean(od['attempted']),
      sent: Boolean(od['sent']),
      reason: String(od['reason'] ?? 'unknown'),
      ...(od['waMessageId'] ? { waMessageId: String(od['waMessageId']) } : {}),
    } : undefined,
    notes: [
      `[real service] ${scenario}`,
      proc != null ? 'Message fully processed.' : 'Duplicate or stored-only (no processing).',
    ],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Real-Service Fixture Inspection ===\n');

  if (process.env['AI_CLASSIFICATION_ENABLED'] !== 'false') {
    console.error('ERROR: AI_CLASSIFICATION_ENABLED must be set to "false".');
    console.error('This prevents external AI provider calls during fixture inspection.');
    console.error('\nRun with:');
    console.error('  AI_CLASSIFICATION_ENABLED=false npm run inspect:fixtures:real');
    console.error('\nOr set it in your .env file:');
    console.error('  AI_CLASSIFICATION_ENABLED=false');
    process.exit(1);
  }

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

  // ── Single-message fixtures ─────────────────────────────────────
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
      results.push({
        scenario,
        from: '(masked)',
        expectedIntent: fixture._expectedIntent,
        expectedReplySource: fixture._expectedReplySource,
        inspection: formatInspection(raw, scenario),
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

  // ── Duplicate idempotency ──────────────────────────────────────
  const dupFixture = allFixtures.find((f) => f._scenario === '16-duplicate-idempotency');
  if (dupFixture) {
    process.stdout.write(`  16-duplicate-idempotency (first)... `);
    try {
      const first = await sendFixture(dupFixture, suffix);
      results.push({
        scenario: '16-duplicate-idempotency-first',
        from: '(masked)',
        expectedIntent: dupFixture._expectedIntent,
        expectedReplySource: dupFixture._expectedReplySource,
        inspection: formatInspection(first, '16-dup'),
      });
      console.log('OK');
      process.stdout.write(`  16-duplicate-idempotency (second)... `);
      const second = await sendFixture(dupFixture, suffix);
      results.push({
        scenario: '16-duplicate-idempotency-second',
        from: '(masked)',
        inspection: formatInspection(second, '16-dup'),
      });
      console.log('OK');
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }
  }

  // ── Multi-turn ─────────────────────────────────────────────────
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

  // ── Output ─────────────────────────────────────────────────────
  console.log('\n' + JSON.stringify(results, null, 2));

  const processed = results.filter((r) => r.inspection.processed).length;
  const duplicates = results.filter((r) => r.inspection.duplicate).length;
  const escalations = results.filter((r) => r.inspection.replySource === 'escalation').length;
  const templates = results.filter((r) => r.inspection.replySource === 'template').length;
  const errors = results.filter((r) => r.error).length;

  console.log(`\n=== Summary ===`);
  console.log(`Total sent:     ${results.length}`);
  console.log(`Processed:      ${processed}`);
  console.log(`Duplicates:     ${duplicates}`);
  console.log(`Templates:      ${templates}`);
  console.log(`Escalations:    ${escalations}`);
  console.log(`Errors:         ${errors}`);
  console.log(`AI replies:     0 (AI_REPLIES_ENABLED=false by default)`);
  console.log(`\nBackend: ${BASE_URL}`);
  console.log(`AI_CLASSIFICATION_ENABLED: ${process.env['AI_CLASSIFICATION_ENABLED'] ?? 'unset'}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
