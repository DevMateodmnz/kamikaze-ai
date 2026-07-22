/**
 * Deterministic customer-pilot proof.
 *
 * Runs against a disposable local database, never calls paid AI, SMTP, n8n,
 * or real Meta endpoints, and removes every generated record in a finally block.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../config/database.js';
import { processInboundMessage } from '../modules/messages/service.js';

// eslint-disable-next-line no-console -- Presentation output is this CLI's contract.
const log = console.log.bind(console);
// eslint-disable-next-line no-console -- Fatal pilot failures must be visible to the operator.
const errorLog = console.error.bind(console);

interface ScenarioResult {
  passed: true;
  intent: string;
  replySource?: string;
  deliveryReason?: string;
  deliverySent?: boolean;
  emailReason?: string;
  duplicate?: boolean;
  durableMessages: number;
  durableEscalations: number;
}

export interface CustomerPilotDemoReport {
  knownQuestion: ScenarioResult;
  escalation: ScenarioResult;
  duplicate: ScenarioResult;
  providerFailure: ScenarioResult;
  externalCalls: {
    ai: 0;
    email: 0;
    n8n: 0;
    metaReal: 0;
    metaInterceptedFailure: 1;
  };
  cleanup: 'completed';
}

interface DemoOptions {
  print?: boolean;
}

function assertPilot(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Pilot assertion failed: ${message}`);
}

function assertDisposableDatabase(): void {
  const raw = process.env.DATABASE_URL;
  assertPilot(raw, 'DATABASE_URL is required');
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, '').toLowerCase();
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const disposableName = ['test', 'demo', 'pilot'].some((word) => database.includes(word));
  assertPilot(
    localHost && disposableName,
    'refusing to run outside a local database named for test/demo/pilot use'
  );
}

function loadVerifiedFixtureAnswer(): string {
  const fixturePath = resolve(
    process.cwd(),
    '../data/kb-verified-acme.example.json'
  );
  const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    answer?: string;
    tags?: string[];
    confidence?: number;
    active?: boolean;
  }[];
  const hours = fixtures.find(
    (entry) =>
      entry.active === true &&
      (entry.confidence ?? 0) > 0.5 &&
      entry.tags?.includes('store_hours') &&
      entry.answer
  );
  assertPilot(hours?.answer, 'verified local store-hours fixture is missing');
  return hours.answer;
}

function setSafeEnvironment(): Record<string, string | undefined> {
  const keys = [
    'NODE_ENV',
    'AI_CLASSIFICATION_ENABLED',
    'AI_REPLIES_ENABLED',
    'WHATSAPP_OUTBOUND_ENABLED',
    'WHATSAPP_OUTBOUND_MODE',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'ESCALATION_EMAIL_ENABLED',
    'COMPANY_NAME',
    'COMPANY_BUSINESS_TYPE',
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = 'test';
  process.env.AI_CLASSIFICATION_ENABLED = 'false';
  process.env.AI_REPLIES_ENABLED = 'false';
  process.env.WHATSAPP_OUTBOUND_ENABLED = 'true';
  process.env.WHATSAPP_OUTBOUND_MODE = 'dry_run';
  process.env.WHATSAPP_ACCESS_TOKEN = '';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '';
  process.env.ESCALATION_EMAIL_ENABLED = 'false';
  process.env.COMPANY_NAME = 'Empresa Demo';
  process.env.COMPANY_BUSINESS_TYPE = 'comercio de demostración';
  return previous;
}

function restoreEnvironment(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

export async function runCustomerPilotDemo(
  options: DemoOptions = {}
): Promise<CustomerPilotDemoReport> {
  assertDisposableDatabase();
  const previousEnv = setSafeEnvironment();
  const originalFetch = globalThis.fetch;
  const runId = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
  const phones = [1, 2, 3, 4].map((n) => `+549000${n}${runId}`);
  let kbEntryId: string | undefined;
  let interceptedMetaCalls = 0;

  try {
    // Guard every network path. Dry-run scenarios must not reach this function;
    // provider-failure deliberately reaches it once and receives a local failure.
    globalThis.fetch = () => {
      interceptedMetaCalls += 1;
      return Promise.reject(new Error('pilot-simulated-provider-unavailable'));
    };

    const fixtureAnswer = loadVerifiedFixtureAnswer();
    const kbEntry = await prisma.knowledgeBaseEntry.create({
      data: {
        category: 'store_info',
        question: '¿Cuáles son los horarios de atención? [fixture local]',
        answer: fixtureAnswer,
        tags: ['horarios', 'store_hours', 'pilot_fixture'],
        confidence: 1,
        active: true,
      },
    });
    kbEntryId = kbEntry.id;

    const known = await processInboundMessage({
      whatsappMessageId: `pilot-known-${runId}`,
      from: phones[0]!,
      text: '¿Cuáles son los horarios de atención?',
    });
    const knownTrace = known.processing?.trace;
    const knownMessages = await prisma.message.count({
      where: { conversationId: known.conversationId },
    });
    const knownEscalations = await prisma.escalation.count({
      where: { conversationId: known.conversationId },
    });
    assertPilot(known.processing?.intent === 'store_hours', 'known intent');
    assertPilot(knownTrace?.replySource === 'knowledge_base', 'verified KB reply source');
    assertPilot(knownTrace.knowledgeBaseEntryId === kbEntry.id, 'verified KB entry used');
    assertPilot(knownTrace.outboundDelivery?.reason === 'dry_run', 'known dry-run delivery');
    assertPilot(knownMessages === 2 && knownEscalations === 0, 'known persistence');

    const escalated = await processInboundMessage({
      whatsappMessageId: `pilot-stock-${runId}`,
      from: phones[1]!,
      text: '¿Hay stock disponible de ese modelo? ¿Quedan unidades?',
    });
    const escalationTrace = escalated.processing?.trace;
    const escalationRecord = await prisma.escalation.findUnique({
      where: { id: escalated.processing?.escalationId ?? '' },
    });
    const escalationMessages = await prisma.message.count({
      where: { conversationId: escalated.conversationId },
    });
    const escalationCount = await prisma.escalation.count({
      where: { conversationId: escalated.conversationId },
    });
    assertPilot(escalated.processing?.intent === 'stock_question', 'stock intent');
    assertPilot(escalated.processing.action === 'escalate', 'stock escalation');
    assertPilot(escalated.processing.replyText?.includes('asesor'), 'customer handoff message');
    assertPilot(escalationRecord?.customerMessage.includes('stock'), 'operator context');
    assertPilot(escalationTrace?.emailNotification?.reason === 'email_disabled', 'email disabled');
    assertPilot(escalationTrace?.outboundDelivery?.reason === 'dry_run', 'handoff dry-run');
    assertPilot(escalationMessages === 2 && escalationCount === 1, 'escalation persistence');

    const duplicateId = `pilot-duplicate-${runId}`;
    const duplicateFirst = await processInboundMessage({
      whatsappMessageId: duplicateId,
      from: phones[2]!,
      text: 'Hola, buenos días',
    });
    const duplicateSecond = await processInboundMessage({
      whatsappMessageId: duplicateId,
      from: phones[2]!,
      text: 'Hola, buenos días',
    });
    const duplicateMessages = await prisma.message.count({
      where: { conversationId: duplicateFirst.conversationId },
    });
    const duplicateEscalations = await prisma.escalation.count({
      where: { conversationId: duplicateFirst.conversationId },
    });
    assertPilot(duplicateSecond.duplicate, 'duplicate flag');
    assertPilot(duplicateSecond.processing === null, 'duplicate skips processing');
    assertPilot(duplicateMessages === 2, 'one inbound and one outbound only');
    assertPilot(duplicateEscalations === 0, 'duplicate creates no escalation');

    process.env.WHATSAPP_OUTBOUND_MODE = 'live';
    process.env.WHATSAPP_ACCESS_TOKEN = 'local-pilot-placeholder';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'local-pilot-placeholder';
    const providerFailure = await processInboundMessage({
      whatsappMessageId: `pilot-provider-failure-${runId}`,
      from: phones[3]!,
      text: 'Hola, necesito orientación',
    });
    const failureTrace = providerFailure.processing?.trace;
    const failureMessages = await prisma.message.count({
      where: { conversationId: providerFailure.conversationId },
    });
    const failureEscalations = await prisma.escalation.count({
      where: { conversationId: providerFailure.conversationId },
    });
    assertPilot(failureTrace?.outboundDelivery?.reason === 'delivery_failed', 'failure trace');
    assertPilot(failureTrace.outboundDelivery.sent === false, 'failure not marked sent');
    assertPilot(failureMessages === 2, 'inbound and outbound survive provider failure');
    assertPilot(interceptedMetaCalls === 1, 'exactly one locally intercepted provider attempt');

    const report: CustomerPilotDemoReport = {
      knownQuestion: {
        passed: true,
        intent: known.processing.intent,
        replySource: knownTrace.replySource ?? undefined,
        deliveryReason: knownTrace.outboundDelivery?.reason,
        durableMessages: knownMessages,
        durableEscalations: knownEscalations,
      },
      escalation: {
        passed: true,
        intent: escalated.processing.intent,
        replySource: escalationTrace.replySource ?? undefined,
        deliveryReason: escalationTrace.outboundDelivery?.reason,
        emailReason: escalationTrace.emailNotification?.reason,
        durableMessages: escalationMessages,
        durableEscalations: escalationCount,
      },
      duplicate: {
        passed: true,
        intent: duplicateFirst.processing?.intent ?? 'duplicate',
        duplicate: duplicateSecond.duplicate,
        durableMessages: duplicateMessages,
        durableEscalations: duplicateEscalations,
      },
      providerFailure: {
        passed: true,
        intent: providerFailure.processing?.intent ?? 'unknown',
        deliveryReason: failureTrace.outboundDelivery.reason,
        deliverySent: failureTrace.outboundDelivery.sent,
        durableMessages: failureMessages,
        durableEscalations: failureEscalations,
      },
      externalCalls: {
        ai: 0,
        email: 0,
        n8n: 0,
        metaReal: 0,
        metaInterceptedFailure: 1,
      },
      cleanup: 'completed',
    };

    if (options.print !== false) {
      log('=== Customer Pilot Demo: deterministic and isolated ===');
      log('A known question: PASS — verified local fixture, dry_run, 2 messages, 0 escalations');
      log('B stock question: PASS — human handoff, email disabled, 2 messages, 1 escalation');
      log('C duplicate delivery: PASS — duplicate=true, no duplicate reply or escalation');
      log('D provider unavailable: PASS — delivery_failed, sent=false, inbound retained');
      log('External calls: AI=0 SMTP=0 n8n=0 Meta real=0 (failure locally intercepted=1)');
    }

    return report;
  } finally {
    globalThis.fetch = originalFetch;
    try {
      await prisma.customer.deleteMany({ where: { phone: { in: phones } } });
      if (kbEntryId) {
        await prisma.knowledgeBaseEntry.deleteMany({ where: { id: kbEntryId } });
      }
    } finally {
      restoreEnvironment(previousEnv);
    }
  }
}

if (require.main === module) {
  runCustomerPilotDemo()
    .then(async () => {
      log('Cleanup: PASS — generated records removed');
      await prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown pilot demo failure';
      errorLog(message);
      await prisma.$disconnect();
      process.exitCode = 1;
    });
}
