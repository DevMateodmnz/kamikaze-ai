/**
 * Decision Engine Types
 */

import type { Intent } from '../intent-detection/types.js';

export type Action = 'reply' | 'escalate' | 'stored_only';

export interface DecisionResult {
  action: Action;
  intent: Intent;
  confidence: number;
  replyText: string | null;
  escalationReason: string | null;
  simulated: false;
  outboundMessageId: string | null;
}

/**
 * Safe response templates in Argentine Spanish.
 *
 * Rules:
 * - Never invent stock, prices, discounts, or warranty terms
 * - Never promise delivery times or availability
 * - Use friendly, commercial tone without emojis
 * - Escalate when uncertain about facts
 */

const REPLY_TEMPLATES: Record<Intent, string> = {
  greeting:
    '¡Hola! Soy el asistente de Kamikaze Bikes. Decime qué estás buscando y te ayudo a orientar la consulta.',

  thanks:
    '¡De nada! Si necesitás algo más, acá estoy. ¡Saludos!',

  goodbye:
    '¡Chau! Si después tenés más consultas, no dudes en escribir. ¡Buena jornada!',

  product_interest:
    'Buenísimo. Para orientarte mejor, decime: qué uso le vas a dar (MTB, ruta, gravel, ciudad), cuál es tu presupuesto aproximado y tu altura o talle si estás buscando una bici completa.',

  store_hours:
    ' Nuestros horarios de atención son de lunes a sábado de 9 a 13 y de 17 a 20. Domingos cerrado. ¿Te queda alguna otra consulta?',

  store_location:
    'Estamos en San Miguel de Tucumán. Podés visitar nuestras sucursales o escribirnos para más info. ¿Te queda alguna otra consulta?',

  payment_methods:
    'Aceptamos efectivo, tarjeta de débito y crédito, MercadoPago y transferencia bancaria. También tenemos financiacion en hasta 12 cuotas. Consultá con un asesor para más detalles. ¿Te queda alguna otra consulta?',

  shipping:
    'Los envíos se coordinan directamente con un asesor. Consultá por tu zona para confirmar disponibilidad y costo. ¿Te queda alguna otra consulta?',

  // stock_question returns escalate (stock is a critical fact)
  stock_question:
    'MSGR_ESCALATE_STOCK',

  // price_question — safe only if the response is general, not specific
  price_question:
    'MSGR_ESCALATE_PRICE',

  // discount_request always escalates (pricing decisions)
  discount_request:
    'MSGR_ESCALATE_DISCOUNT',

  // warranty_or_return always escalates (legal/policy)
  warranty_or_return:
    'MSGR_ESCALATE_WARRANTY',

  // complaint always escalates (customer emotion)
  complaint:
    'MSGR_ESCALATE_COMPLAINT',

  // human_request always escalates (explicit request)
  human_request:
    'MSGR_ESCALATE_HUMAN',

  // unknown — safe fallback
  unknown:
    'Gracias por tu mensaje. Un asesor te va a responder a la brevedad. ¡Saludos!',
};

const ESCALATION_REASONS: Record<Intent, string> = {
  greeting: 'not_used',
  thanks: 'not_used',
  goodbye: 'not_used',
  human_request: 'explicit_human_request',
  stock_question: 'stock_confirmation_required',
  price_question: 'price_confirmation_required',
  discount_request: 'discount_requires_approval',
  warranty_or_return: 'warranty_policy_required',
  complaint: 'customer_expressed_dissatisfaction',
  product_interest: 'not_used',
  store_hours: 'not_used',
  store_location: 'not_used',
  payment_methods: 'not_used',
  shipping: 'not_used',
  unknown: 'not_used',
};

/**
 * Make a decision based on intent and optional context.
 *
 * Returns a DecisionResult with action, reply text, and escalation reason.
 *
 * IMPORTANT:
 * - Does NOT access database or external services
 * - Pure function — deterministic output for given input
 * - Does NOT create any records
 */
export function makeDecision(
  intent: Intent,
  confidence: number
): DecisionResult {
  // Check if this intent requires escalation
  const escalateIntents: Intent[] = [
    'human_request',
    'stock_question',
    'price_question',
    'discount_request',
    'warranty_or_return',
    'complaint',
  ];

  const requiresEscalation = escalateIntents.includes(intent);

  if (requiresEscalation) {
    return {
      action: 'escalate',
      intent,
      confidence,
      replyText: null,
      escalationReason: ESCALATION_REASONS[intent],
      simulated: false,
      outboundMessageId: null,
    };
  }

  // Safe reply intents
  const safeReplyIntents: Intent[] = [
    'greeting',
    'thanks',
    'goodbye',
    'product_interest',
    'store_hours',
    'store_location',
    'payment_methods',
    'shipping',
    'unknown',
  ];

  if (safeReplyIntents.includes(intent)) {
    const replyText = REPLY_TEMPLATES[intent];

    return {
      action: 'reply',
      intent,
      confidence,
      replyText,
      escalationReason: null,
      simulated: false,
      outboundMessageId: null,
    };
  }

  // Should never reach here, but safe fallback
  return {
    action: 'stored_only',
    intent,
    confidence,
    replyText: null,
    escalationReason: null,
    simulated: false,
    outboundMessageId: null,
  };
}