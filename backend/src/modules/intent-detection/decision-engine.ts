/**
 * Decision Engine
 *
 * Makes reply-vs-escalate decisions based on detected intent.
 * Pure function — deterministic output for given input.
 * No DB access. No external services. No env reads.
 *
 * Company-specific data is injected via BusinessProfile
 * (passed from the call site, which reads env/config).
 */

import type { Intent } from '../intent-detection/types.js';
import type { BusinessProfile } from '../../config/business-profile.js';

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
 * Build reply templates interpolated with business profile data.
 *
 * Templates that contain company-specific facts (name, hours, location,
 * payment methods, shipping) read from the profile. Generic templates
 * (thanks, goodbye, product_interest) and escalation sentinels are static.
 *
 * Rules:
 * - Never invent stock, prices, discounts, or warranty terms
 * - Never promise delivery times or availability
 * - Use friendly, commercial tone without emojis
 * - Escalate when uncertain about facts
 */
function buildReplyTemplates(
  profile: BusinessProfile
): Record<Intent, string> {
  return {
    greeting: `¡Hola! Soy el asistente de ${profile.companyName}. Decime qué estás buscando y te ayudo a orientar la consulta.`,

    thanks: '¡De nada! Si necesitás algo más, acá estoy. ¡Saludos!',

    goodbye:
      '¡Chau! Si después tenés más consultas, no dudes en escribir. ¡Buena jornada!',

    product_interest:
      `Buenísimo. Para orientarte mejor, decime: qué uso le vas a dar (${profile.productCategories}), cuál es tu presupuesto aproximado y qué características estás buscando.`,

    store_hours: `Nuestros horarios de atención son de ${profile.hours}. ¿Te queda alguna otra consulta?`,

    store_location: `Estamos en ${profile.location}. Podés visitar nuestras sucursales o escribirnos para más info. ¿Te queda alguna otra consulta?`,

    payment_methods: `${profile.paymentMethods} ¿Te queda alguna otra consulta?`,

    shipping: `${profile.shippingPolicy} ¿Te queda alguna otra consulta?`,

    // ── Escalation sentinels (no company data needed) ──────────
    stock_question: 'MSGR_ESCALATE_STOCK',
    price_question: 'MSGR_ESCALATE_PRICE',
    discount_request: 'MSGR_ESCALATE_DISCOUNT',
    warranty_or_return: 'MSGR_ESCALATE_WARRANTY',
    complaint: 'MSGR_ESCALATE_COMPLAINT',
    human_request: 'MSGR_ESCALATE_HUMAN',

    // ── Unknown handoff ───────────────────────────────────────
    unknown:
      'No quiero darte información incorrecta. Te paso con un asesor para que pueda ayudarte mejor. ¡Gracias por tu paciencia!',
  };
}

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
  unknown: 'unknown',
};

/**
 * Make a decision based on intent, confidence, and business profile.
 *
 * @param intent   The detected customer intent
 * @param confidence  Classification confidence (0-1)
 * @param profile  Business profile with company identity and facts.
 *                 Passed from the call site — this function does NOT
 *                 read env vars or external config directly.
 *
 * IMPORTANT:
 * - Does NOT access database or external services
 * - Pure function — deterministic output for given input
 * - Does NOT create any records
 */
export function makeDecision(
  intent: Intent,
  confidence: number,
  profile: BusinessProfile
): DecisionResult {
  const templates = buildReplyTemplates(profile);

  // Check if this intent requires escalation
  const escalateIntents: Intent[] = [
    'human_request',
    'stock_question',
    'price_question',
    'discount_request',
    'warranty_or_return',
    'complaint',
    'unknown',
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
  ];

  if (safeReplyIntents.includes(intent)) {
    const replyText = templates[intent];

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
