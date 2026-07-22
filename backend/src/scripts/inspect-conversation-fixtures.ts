/**
 * Inspect Conversation Fixtures — Local Dev Tool
 *
 * Reads data/manual-test-fixtures/whatsapp-conversation-flow.example.json
 * and prints a safe inspection summary for each runnable fixture using
 * the inspectMessageProcessing() formatter.
 *
 * No DB. No network. No real customer data. No secrets.
 *
 * Run: npx tsx src/scripts/inspect-conversation-fixtures.ts
 *   or: npm run inspect:fixtures
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { inspectMessageProcessing } from '../modules/messages/inspection.js';
import type { ProcessMessageResult } from '../modules/messages/service.js';
import type {
  MessageProcessingTrace,
  ReplySource,
} from '../modules/messages/types.js';
import type { Intent } from '../modules/intent-detection/types.js';

// eslint-disable-next-line no-console -- This local CLI intentionally prints its inspection report.
const log = console.log.bind(console);

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
const parsedFixtures: unknown = JSON.parse(raw);
const allFixtures = Array.isArray(parsedFixtures)
  ? parsedFixtures as FixtureEntry[]
  : [];

// Only entries with _expectedIntent are inspectable
const runnable = allFixtures.filter((f) => f._expectedIntent);

// ---------------------------------------------------------------------------
// Mock ProcessMessageResult builder
// ---------------------------------------------------------------------------

function buildMockResult(fixture: FixtureEntry): ProcessMessageResult {
  const intent = (fixture._expectedIntent ?? 'unknown') as Intent;
  const replySource = (fixture._expectedReplySource ?? 'template') as ReplySource;
  const isEscalation = replySource === 'escalation';

  const trace: MessageProcessingTrace = {
    intent,
    intentSource: isEscalation ? 'ai' : 'fallback',
    replySource: isEscalation ? 'escalation' : replySource,
    aiIntentUsed: isEscalation,
    aiReplyUsed: false,
    aiReplyEnabled: false,
    confidence: 0.9,
  };

  return {
    success: true,
    messageId: `mock-msg-${fixture._scenario ?? 'unknown'}`,
    conversationId: `mock-conv-${fixture._scenario ?? 'unknown'}`,
    customerId: 'mock-cust-000',
    duplicate: false,
    processing: {
      intent,
      confidence: 0.9,
      action: isEscalation ? 'escalate' : 'reply',
      replyText: isEscalation ? null : '[template reply — not shown]',
      escalationReason: isEscalation ? 'mock_reason' : null,
      outboundMessageId: isEscalation ? null : `mock-out-${fixture._scenario ?? 'x'}`,
      escalationId: isEscalation ? `mock-esc-${fixture._scenario ?? 'x'}` : null,
      trace,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

log('=== Conversation Fixture Inspection ===\n');
log(`Fixtures with metadata: ${runnable.length} of ${allFixtures.length}\n`);

const results = runnable.map((fixture) => {
  const mockResult = buildMockResult(fixture);
  const inspection = inspectMessageProcessing(mockResult);
  return {
    scenario: fixture._scenario ?? 'unknown',
    from: '(masked)',
    expectedIntent: fixture._expectedIntent,
    expectedReplySource: fixture._expectedReplySource,
    inspection,
  };
});

// Output as formatted JSON
log(JSON.stringify(results, null, 2));

// Summary
const processed = results.filter((r) => r.inspection.processed).length;
const escalations = results.filter(
  (r) => r.inspection.replySource === 'escalation'
).length;
const templates = results.filter(
  (r) => r.inspection.replySource === 'template'
).length;

log(`\n=== Summary ===`);
log(`Total runnable: ${results.length}`);
log(`Processed:      ${processed}`);
log(`Templates:      ${templates}`);
log(`Escalations:    ${escalations}`);
log(`AI replies:     0 (AI_REPLIES_ENABLED=false by default)`);
