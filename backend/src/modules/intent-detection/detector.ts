/**
 * Intent Detection — Deterministic Keyword-Based
 *
 * IMPORTANT LIMITATIONS:
 * - This is NOT AI. It is simple keyword matching.
 * - No semantic understanding. "No quiero stock" would NOT be detected as stock_question.
 * - No context awareness. Conversation history is ignored.
 * - Will misclassify typos, slang, or unusual phrasing.
 * - Designed for WhatsApp-style short messages in Argentine Spanish.
 *
 * Use cases:
 * - Fast classification for non-AI fallback
 * - Safe routing before real AI integration
 * - Testing without API key dependency
 *
 * Do NOT rely on this for critical business decisions.
 */

import type { Intent, IntentDetectionResult, IntentDetectorConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

// Keyword maps per intent
// Each entry maps an intent to its triggering keywords (lowercase)
const INTENT_KEYWORDS: Record<Intent, string[]> = {
  greeting: [
    'hola', 'buenos dias', 'buenas tardes', 'buenas noches',
    'como estas', 'como va', 'que tal', 'hey', 'oi', 'buen dia',
  ],
  thanks: [
    'gracias', 'muchas gracias', 'te agradezco', 'mil gracias',
    'gracias totales', ' gracias ',
  ],
  goodbye: [
    'chau', 'hasta luego', 'nos vemos', 'me voy', 'saludos',
    'buen fin de semana', 'hasta mañana', 'nos vemos',
  ],
  human_request: [
    'hablar con alguien', 'hablar con una persona', 'un asesor',
    'atencion humana', 'persona real', 'empleado', 'vendedor',
    'persona', 'humano', 'asesor',
  ],
  stock_question: [
    'tiene stock', 'hay stock', 'esta disponible', 'disponible?',
    'en stock', 'stock disponible', 'quedan', 'hay unidades',
    'hay en existencia', 'existencia', 'disponible', 'disponibles',
  ],
  price_question: [
    'precio', 'cuanto cuesta', 'cuanto vale', 'valor', 'costo',
    'cuanto sale', 'presupuesto', 'presupuestar',
  ],
  discount_request: [
    'descuento', 'oferta', 'promo', 'rebaja', 'menos precio',
    'bajarle', 'negociar', 'convenio', 'por mayor',
    'descuentos', 'en oferta',
  ],
  warranty_or_return: [
    'garantia', 'devolucion', 'cambio', 'reembolso', 'devolver',
    'garantía', 'devolución', 'cambiar', 'reintegrar',
  ],
  complaint: [
    'queja', 'problema', 'mal', 'no me gusto', 'pésimo',
    'terrible', 'horrible', 'enojado', 'enojada', 'furia',
    'fraude', 'estafa', 'no funciona', 'roto', 'rota',
  ],
  product_interest: [
    'bicicleta', 'bici', 'bicis', 'mtb', 'ruta', 'gravel', 'urbana',
    'playera', 'carretera', 'cuadro', 'frame', 'rodado',
    'cambios', 'frenos', 'suspension', 'horquilla', 'transmision',
  ],
  store_hours: [
    'horarios', 'hora de cierre', 'hora de apertura', 'abren',
    'cierran', 'que hora', 'a qué hora', 'atencion',
  ],
  store_location: [
    'direccion', 'ubicacion', 'ubicación', 'ubicados',
    'donde estan', 'donde queda', 'queda el local',
    'como llego', 'mapa', 'sucursal', 'dirección',
    'local fisico', 'local físico',
  ],
  payment_methods: [
    'pago', 'tarjeta', 'efectivo', 'debito', 'credito',
    'mercadopago', 'transferencia', 'cheque', 'cuotas',
    'plan', 'financiacion', 'financiar',
  ],
  shipping: [
    'envio', 'envíos', 'entrega', 'domicilio', 'mandar',
    'recibir en casa', 'delivery', 'enviar',
  ],
  unknown: [],
};

// Order matters: more specific intents should be checked after general ones
const INTENT_PRIORITY: Intent[] = [
  'human_request',
  'complaint',
  'warranty_or_return',
  'discount_request',
  'stock_question',
  'price_question',
  'product_interest',
  'store_hours',
  'store_location',
  'payment_methods',
  'shipping',
  'thanks',
  'goodbye',
  'greeting',
  'unknown',
];

/**
 * Detect intent from customer message text.
 *
 * Uses keyword frequency and specificity scoring.
 * Returns the first intent whose keywords exceed the threshold.
 */
export function detectIntent(
  text: string,
  config: IntentDetectorConfig = DEFAULT_CONFIG
): IntentDetectionResult {
  const normalized = config.caseInsensitive ? text.toLowerCase() : text;

  // Score each intent by matching keywords
  const scores: Map<Intent, { score: number; matched: string[] }> = new Map<Intent, { score: number; matched: string[] }>();

  for (const intent of INTENT_PRIORITY) {
    if (intent === 'unknown') continue;

    const keywords = INTENT_KEYWORDS[intent];
    const matched: string[] = [];

    for (const keyword of keywords) {
      // Check if keyword appears as word boundary match
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, config.caseInsensitive ? 'i' : '');
      if (regex.test(normalized)) {
        matched.push(keyword);
      }
    }

    if (matched.length > 0) {
      scores.set(intent, { score: matched.length, matched });
    }
  }

  // Find best intent (highest score, first in priority on tie)
  let bestIntent: Intent = 'unknown';
  let bestScore = 0;
  let bestMatched: string[] = [];

  for (const intent of INTENT_PRIORITY) {
    const entry = scores.get(intent);
    if (!entry) continue;

    if (entry.score > bestScore) {
      bestScore = entry.score;
      bestIntent = intent;
      bestMatched = entry.matched;
    }
  }

  // Confidence: how certain are we?
  // Base confidence on keyword match count and uniqueness
  let confidence = 0;
  if (bestScore === 0) {
    bestIntent = 'unknown';
    confidence = 0.1; // Very uncertain
  } else if (bestScore >= 2) {
    confidence = 0.85; // Strong match
  } else if (bestScore === 1) {
    // Single match — be conservative
    // High-risk intents get lower confidence so they escalate
    const highRiskIntents: Intent[] = [
      'stock_question', 'price_question', 'discount_request',
      'warranty_or_return', 'complaint',
    ];
    confidence = highRiskIntents.includes(bestIntent) ? 0.55 : 0.75;
  }

  return {
    intent: bestIntent,
    confidence,
    matchedKeywords: bestMatched,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}