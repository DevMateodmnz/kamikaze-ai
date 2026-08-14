/** Credential-free, deterministic inspection of the persisted delivery lifecycle. */

import { prisma } from '../config/database.js';
import { customersService } from '../modules/customers/service.js';
import { conversationsService } from '../modules/conversations/service.js';
import { messagesService } from '../modules/messages/service.js';
import {
  recordOutboundProviderMessage,
  reconcileWhatsAppDeliveryStatus,
} from '../modules/messages/whatsapp-delivery.js';

// eslint-disable-next-line no-console -- Human-readable proof output is this CLI's contract.
const log = console.log.bind(console);
// eslint-disable-next-line no-console -- Fatal proof failures must be visible to the operator.
const errorLog = console.error.bind(console);

const FAKE_WAMID = 'wamid.OFFLINE_DEMO_NOT_FROM_META';
const UNMATCHED_WAMID = 'wamid.OFFLINE_UNMATCHED_NOT_FROM_META';

function simulatedEvent(providerMessageId: string, status: string, timestamp: string) {
  return {
    providerMessageId,
    status,
    timestamp,
    recipientId: '15550000001',
    rawEvent: {
      id: providerMessageId,
      status,
      timestamp,
      recipient_id: '15550000001',
      _fixture: 'offline simulation; not received from Meta',
    },
  };
}

async function main() {
  log('=== SIMULACIÓN OFFLINE DE ESTADOS WHATSAPP ===');
  log('EVIDENCIA SIMULADA: no se llamó a Meta y ningún teléfono recibió mensajes.');

  const customer = await customersService.identifyCustomer('+5493810000000');
  const conversation = await conversationsService.getOrCreateConversation(customer.id);
  const outbound = await messagesService.storeOutboundMessage({
    conversationId: conversation.id,
    content: '[fixture offline] Respuesta ficticia para inspección de persistencia.',
  });
  await recordOutboundProviderMessage(outbound.id, FAKE_WAMID, 'OFFLINE_SIMULATION');
  log(`OUTBOUND SIMULADO creado: internalId=${outbound.id} fakeWamid=${FAKE_WAMID}`);

  for (const [status, timestamp] of [
    ['sent', '1786723200'],
    ['delivered', '1786723201'],
    ['read', '1786723202'],
  ] as const) {
    const result = await reconcileWhatsAppDeliveryStatus(simulatedEvent(FAKE_WAMID, status, timestamp));
    log(`CALLBACK SIMULADO status=${status}: matched=${result.matched} applied=${result.aggregateApplied}`);
  }

  const replay = await reconcileWhatsAppDeliveryStatus(simulatedEvent(FAKE_WAMID, 'read', '1786723202'));
  log(`REPLAY SIMULADO status=read: duplicate=${replay.duplicate}`);

  const unmatched = await reconcileWhatsAppDeliveryStatus(
    simulatedEvent(UNMATCHED_WAMID, 'delivered', '1786723203')
  );
  log(`CALLBACK SIMULADO SIN MATCH: matched=${unmatched.matched} acknowledged-safe=true`);

  const aggregate = await prisma.message.findUnique({ where: { id: outbound.id } });
  const history = await prisma.whatsAppDeliveryEvent.findMany({
    where: { providerMessageId: { in: [FAKE_WAMID, UNMATCHED_WAMID] } },
    orderBy: { receivedAt: 'asc' },
    select: {
      providerMessageId: true,
      status: true,
      messageId: true,
      aggregateApplied: true,
    },
  });

  log(`AGREGADO FINAL SIMULADO: status=${aggregate?.deliveryStatus} mode=${aggregate?.deliveryMode}`);
  log(`EVIDENCIA PERSISTIDA SIMULADA: ${history.length} eventos únicos`);
  for (const item of history) {
    log(`  fakeWamid=${item.providerMessageId} status=${item.status} matched=${item.messageId !== null} applied=${item.aggregateApplied}`);
  }
  log('RESULTADO: prueba offline completa; NO demuestra aceptación de Meta ni recepción en un teléfono.');
}

main()
  .catch((error: unknown) => {
    errorLog('La simulación offline falló:', error instanceof Error ? error.message : 'error desconocido');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
