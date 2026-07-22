/**
 * AI Reply Content Guardrails
 *
 * Deterministic, pattern-based safety checks for AI-generated replies.
 * No AI judging — pure string/pattern matching.
 * No business-specific facts hardcoded.
 *
 * If a guardrail fires, the AI reply is discarded and the system
 * falls back to deterministic template/KB reply.
 * Guardrail rejection never crashes the pipeline, never escalates,
 * and never exposes internal reasons to the customer.
 */

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

/**
 * Price/currency patterns: dollar sign + digits, currency codes with amounts.
 * Does NOT block plain numbers without currency context.
 */
const PRICE_PATTERNS = [
  /\$\s*\d[\d,.]*/i,
  /\d[\d,.]*\s*(USD|EUR|ARS|€)\b/i,
  /\d[\d,.]*\s*pesos\b/i,
  /\b(precio|precios|cuesta|cuestan|vale|valen|sale|salen)\b.{0,10}\$\s*\d/i,
];

/**
 * Stock certainty claims. Only blocks explicit certainty — not general mentions.
 */
const STOCK_PATTERNS = [
  /\btenemos stock\b/i,
  /\bhay stock\b/i,
  /\bdisponible ahora\b/i,
  /\bavailable now\b/i,
  /\b(todos|todas)\s+(los|las)\s+(modelos|medidas|talles)\s+disponibles?\b/i,
  /\bstock (confirmado|asegurado|garantizado)\b/i,
];

/**
 * Promises the business cannot make: discounts, financing, warranty, delivery.
 */
const PROMISE_PATTERNS = [
  /\bdescuento del\b/i,
  /\bte (hago|hacemos|ofrezco|ofrecemos) (un |el )?descuento\b/i,
  /\b(cupón|cupon)\b/i,
  /\baprobamos (tu |la )?financiaci[oó]n\b/i,
  /\b(financiamos|financiación aprobada)\b/i,
  /\bgarant[ií]a\b.{0,20}\b(aprobada|cubierta|extendida)\b/i,
  /\b(reembolso|devolución) (aprobad[oa]|confirmad[oa])\b/i,
  /\bte (lo |la )?entregamos el\b/i,
  /\bentrega (garantizada|asegurada|confirmada)\b/i,
  /\b(garantizamos|te garantizo)\b/i,
];

/**
 * Legal, medical, financial, or safety-critical advice.
 */
const ADVICE_PATTERNS = [
  /\blegalmente\b/i,
  /\bm[ée]dicamente\b/i,
  /\bte conviene invertir\b/i,
  /\basesor[ií]a (legal|financiera|m[ée]dica)\b/i,
];

/**
 * False completed actions — the AI claiming it did something it can't do.
 * Uses \s|$ instead of \b after accented chars (JS \b doesn't work with accents).
 */
const FALSE_ACTION_PATTERNS = [
  /\bya reserv[ée](\s|$|\.|,)/i,
  /\bya compr[ée](\s|$|\.|,)/i,
  /\bya agend[ée](\s|$|\.|,)/i,
  /\bte confirmo el pedido\b/i,
  /\btu pedido qued[oó] confirmado\b/i,
  /\bya gestion[ée](\s|$|\.|,)/i,
];

/**
 * URLs and external links. Block all for now — no approved link context exists.
 */
const URL_PATTERNS = [
  /https?:\/\//i,
  /www\.\w+\.(com|net|org|io|ar|es)\b/i,
];

/**
 * Prompt injection / internal instruction leakage.
 * Specific patterns only — no single-character triggers.
 */
const INJECTION_PATTERNS = [
  /\b(system|developer|assistant):\s*/i,
  /\bignore (previous|all) instructions?\b/i,
  /\binstrucciones internas?\b/i,
  /\bmensaje del sistema\b/i,
  /\bprompt interno\b/i,
];

/**
 * AI identity leak — phrases that break the business assistant experience.
 * Specific multi-word phrases only — no generic "soy un" false positives.
 */
const AI_IDENTITY_PATTERNS = [
  /\bsoy un modelo de lenguaje\b/i,
  /\bsoy una inteligencia artificial\b/i,
  /\bcomo IA\b/i,
  /\bas an AI\b/i,
  /\bcomo inteligencia artificial\b/i,
  /\bAI language model\b/i,
];

/**
 * Inappropriate content — conservative list, not a full moderation system.
 * Uses patterns that match within words to catch plurals (e.g. inútiles).
 */
const INAPPROPRIATE_PATTERNS = [
  /\bin[úu]til/i,
  /\best[úu]pid/i,
  /\bidiota\b/i,
  /\bimb[ée]cil/i,
  /\bmierda\b/i,
  /\bputa?\b/i,
  /\bcarajo\b/i,
  /\bmatar\b/i,
  /\bviolar\b/i,
  /\babusar\b/i,
];

const MIN_REPLY_LENGTH = 3;

// ---------------------------------------------------------------------------
// Guardrail engine
// ---------------------------------------------------------------------------

interface Rule {
  name: string;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  { name: 'price', patterns: PRICE_PATTERNS },
  { name: 'stock', patterns: STOCK_PATTERNS },
  { name: 'discount/warranty/delivery promise', patterns: PROMISE_PATTERNS },
  { name: 'legal/medical advice', patterns: ADVICE_PATTERNS },
  { name: 'false action', patterns: FALSE_ACTION_PATTERNS },
  { name: 'url', patterns: URL_PATTERNS },
  { name: 'injection', patterns: INJECTION_PATTERNS },
  { name: 'AI identity', patterns: AI_IDENTITY_PATTERNS },
  { name: 'inappropriate', patterns: INAPPROPRIATE_PATTERNS },
];

/**
 * Validate an AI-generated reply against content guardrails.
 *
 * @returns { allowed: boolean; reason?: string }
 *   - allowed: true if the reply passes all guardrails
 *   - reason: category of the first failing guardrail (for internal logging only)
 */
export function validateAiReply(replyText: string): GuardrailResult {
  // Empty / whitespace / too short
  if (!replyText || replyText.trim().length < MIN_REPLY_LENGTH) {
    return { allowed: false, reason: 'empty or too short' };
  }

  // Check each rule category
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(replyText)) {
        return { allowed: false, reason: rule.name };
      }
    }
  }

  return { allowed: true };
}
