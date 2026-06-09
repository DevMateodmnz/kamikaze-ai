/**
 * Knowledge Base Seed Script
 *
 * Run: npx tsx src/scripts/seed-knowledge-base.ts
 *
 * Idempotent: uses category+question matching to avoid duplicates.
 * Only active=true + confidence > 0.5 + non-placeholder entries are served.
 *
 * Data sources (merged, both idempotent):
 *   1. Inline SEED_ENTRIES (base placeholders + 3 verified FAQs)
 *   2. ../../data/kb-verified.json  (optional per-deployment verified data)
 *      Copy data/kb-verified.example.json → data/kb-verified.json,
 *      fill in real answers, and set active: true for verified entries.
 *
 * IMPORTANT: Do NOT activate placeholder entries without business confirmation.
 *            Only the business owner should fill in data/kb-verified.json.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import prisma from '../config/database.js';

const SEED_ENTRIES = [
  // ============================================
  // STORE HOURS — NEEDS BUSINESS VERIFICATION
  // ============================================
  {
    category: 'store_info',
    question: 'Cuáles son los horarios de atención?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Los horarios de atención exactos deben ser confirmados con {{COMPANY_NAME}} antes de activar esta respuesta. No inventar horarios.',
    tags: ['horarios', 'atencion', 'horas', 'store_hours'],
    confidence: 0.3, // Low confidence — placeholder
    active: false, // DO NOT ACTIVATE until verified
  },
  {
    category: 'store_info',
    question: 'A qué hora abren?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar horario de apertura con {{COMPANY_NAME}}.',
    tags: ['horarios', 'apertura', 'store_hours'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'A qué hora cierran?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar horario de cierre con {{COMPANY_NAME}}.',
    tags: ['horarios', 'cierre', 'store_hours'],
    confidence: 0.3,
    active: false,
  },

  // ============================================
  // STORE LOCATION — NEEDS BUSINESS VERIFICATION
  // ============================================
  {
    category: 'store_info',
    question: 'Dónde están ubicados?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: La dirección exacta debe ser confirmada con {{COMPANY_NAME}} antes de compartirla con clientes.',
    tags: ['ubicacion', 'direccion', 'sucursal', 'store_location'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'Tienen más de una sucursal?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar количество de sucursales y sus direcciones con {{COMPANY_NAME}}.',
    tags: ['sucursal', 'ubicacion', 'store_location'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'Cómo llego a la tienda?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Proporcionar indicaciones de transporte solo después de que {{COMPANY_NAME}} confirme la dirección exacta.',
    tags: ['direccion', 'como_llegar', 'mapa', 'store_location'],
    confidence: 0.3,
    active: false,
  },

  // ============================================
  // PAYMENT METHODS — NEEDS BUSINESS VERIFICATION
  // ============================================
  {
    category: 'store_info',
    question: 'Qué medios de pago aceptan?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Los métodos de pago exactos deben ser confirmados con {{COMPANY_NAME}}. No inventar información financiera.',
    tags: ['pago', 'tarjeta', 'efectivo', 'mercadopago', 'payment_methods'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'Puedo pagar con tarjeta?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar qué tipos de tarjeta acepta {{COMPANY_NAME}} (débito, crédito, cuotas).',
    tags: ['tarjeta', 'pago', 'cuotas', 'payment_methods'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'Tienen financiación?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar opciones de financiación, cuotas y condiciones con {{COMPANY_NAME}}.',
    tags: ['financiacion', 'cuotas', 'pago', 'payment_methods'],
    confidence: 0.3,
    active: false,
  },

  // ============================================
  // SHIPPING — NEEDS BUSINESS VERIFICATION
  // ============================================
  {
    category: 'store_info',
    question: 'Hacen envíos a domicilio?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar si {{COMPANY_NAME}} ofrece envío a domicilio, zonas de cobertura y costos.',
    tags: ['envio', 'entrega', 'domicilio', 'shipping'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'Cuánto cuesta el envío?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Los costos de envío deben ser confirmados con {{COMPANY_NAME}} antes de informar al cliente.',
    tags: ['envio', 'costo', 'shipping'],
    confidence: 0.3,
    active: false,
  },

  // ============================================
  // WARRANTY / RETURNS — NEEDS BUSINESS VERIFICATION
  // ============================================
  {
    category: 'policy',
    question: 'Tiene garantía la bici?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Los términos de garantía deben ser confirmados con {{COMPANY_NAME}} antes de informar al cliente.',
    tags: ['garantia', 'warranty', 'warranty_or_return'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'policy',
    question: 'Puedo devolver o cambiar la bici?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: La política de devoluciones/cambios debe ser confirmada con {{COMPANY_NAME}} antes de compartirla.',
    tags: ['devolucion', 'cambio', 'return', 'warranty_or_return'],
    confidence: 0.3,
    active: false,
  },

  // ============================================
  // GENERAL FAQ — Verified or Safe Defaults
  // ============================================
  {
    category: 'faq',
    question: 'Qué tipos de bicis venden?',
    answer: '{{COMPANY_NAME}} ofrece bicicletas de todo tipo: MTB, ruta, gravel, urbanas y playeras. Consultá con un asesor para encontrar la que mejor se adapte a tu uso y presupuesto.',
    tags: ['tipos', 'mtb', 'ruta', 'gravel', 'urbana'],
    confidence: 0.8, // Safe general info
    active: true,
  },
  {
    category: 'faq',
    question: 'Venden bicis para niños?',
    answer: 'Sí, tenemos opciones de bicicletas para niños. Consultá con un asesor specifying age and intended use para orientarte mejor.',
    tags: ['ninos', 'ninas', 'infantil'],
    confidence: 0.7,
    active: true,
  },
  {
    category: 'faq',
    question: 'Hacen reparaciones?',
    answer: 'Sí, {{COMPANY_NAME}} ofrece servicio de reparaciones. Consultá con un asesor para confirmar disponibilidad y tiempos.',
    tags: ['reparacion', 'service', 'mantenimiento'],
    confidence: 0.6,
    active: true,
  },
];

/**
 * Optional per-deployment verified KB entries from JSON.
 * Returns empty array if the file doesn't exist (graceful degradation).
 */
function loadVerifiedEntries(): typeof SEED_ENTRIES {
  // Resolve relative to backend cwd (seed script runs from backend/)
  const jsonPath = resolve(process.cwd(), '../data/kb-verified.json');

  if (!existsSync(jsonPath)) {
    console.log('ℹ️  data/kb-verified.json not found — using only inline seed entries.');
    return [];
  }

  try {
    const raw = readFileSync(jsonPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      console.warn('⚠️  data/kb-verified.json is not an array — skipping.');
      return [];
    }

    const entries: typeof SEED_ENTRIES = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const e = item as Record<string, unknown>;
      if (!e.category || !e.answer) {
        console.warn('⚠️  Skipping entry with missing category/answer:', e);
        continue;
      }

      entries.push({
        category: String(e.category),
        question: typeof e.question === 'string' ? e.question : null,
        answer: String(e.answer),
        tags: Array.isArray(e.tags)
          ? e.tags.map((t: unknown) => String(t))
          : [],
        confidence: typeof e.confidence === 'number' ? e.confidence : 0.3,
        active: Boolean(e.active),
      } as (typeof SEED_ENTRIES)[number]);
    }

    console.log(`📄 Loaded ${entries.length} entries from data/kb-verified.json`);
    return entries;
  } catch (err) {
    console.warn('⚠️  Failed to parse data/kb-verified.json:', (err as Error).message);
    return [];
  }
}

async function seed() {
  console.log('🌱 Seeding knowledge base...');

  // Resolve company name for seed data placeholders
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- || catches empty strings
  const companyName = process.env.COMPANY_NAME || 'Kamikaze Bikes';

  // Merge inline entries + optional verified JSON entries
  const allEntries = [...SEED_ENTRIES, ...loadVerifiedEntries()];

  let created = 0;
  let skipped = 0;

  for (const entry of allEntries) {
    // Upsert based on category + question (stable composite key)
    const existing = await prisma.knowledgeBaseEntry.findFirst({
      where: {
        category: entry.category,
        question: entry.question,
      },
    });

    if (existing) {
      console.log(`  ⏭️  Skipping (exists): [${entry.category}] ${(entry.question ?? '').substring(0, 40)}...`);
      skipped++;
      continue;
    }

    await prisma.knowledgeBaseEntry.create({
      data: {
        category: entry.category,
        question: entry.question,
        answer: entry.answer.replace(/\{\{COMPANY_NAME\}\}/g, companyName),
        tags: entry.tags,
        confidence: entry.confidence,
        active: entry.active,
      },
    });

    const status = entry.active ? '✅' : '⚠️ ';
    console.log(`  ${status} Created: [${entry.category}] ${(entry.question ?? '').substring(0, 40)}... (active=${entry.active})`);
    created++;
  }

  console.log(`\n📊 Seed complete: ${created} created, ${skipped} skipped`);

  const totalActive = await prisma.knowledgeBaseEntry.count({ where: { active: true } });
  const totalInactive = await prisma.knowledgeBaseEntry.count({ where: { active: false } });
  const total = await prisma.knowledgeBaseEntry.count();

  console.log(`📊 Total entries: ${total} (${totalActive} active, ${totalInactive} inactive)`);
  console.log('\n⚠️  NOTE: Entries with active=false have NEEDS_BUSINESS_VERIFICATION.');
  console.log('    Do NOT set active=true until the business owner has confirmed the information.');
  console.log('    Copy data/kb-verified.example.json → data/kb-verified.json to add verified entries.');
}

seed()
  .then(() => {
    console.log('\n✅ Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  });