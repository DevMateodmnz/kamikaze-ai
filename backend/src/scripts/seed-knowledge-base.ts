/**
 * Knowledge Base Seed Script
 *
 * Run: npx tsx src/scripts/seed-knowledge-base.ts
 *
 * Idempotent: uses upsert logic based on category+question to avoid duplicates.
 * Marked entries with NEEDS_BUSINESS_VERIFICATION have active=false.
 * Only active=true entries are used for customer replies.
 *
 * IMPORTANT: Do NOT activate placeholder entries without business confirmation.
 *            Copy the answer text from WhatsApp/tucuman to the entry only after
 *            Kamikaze Bikes has verified the information.
 */

import prisma from '../config/database.js';

const SEED_ENTRIES = [
  // ============================================
  // STORE HOURS — NEEDS BUSINESS VERIFICATION
  // ============================================
  {
    category: 'store_info',
    question: 'Cuáles son los horarios de atención?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Los horarios de atención exactos deben ser confirmados con Kamikaze Bikes antes de activar esta respuesta. No inventar horarios.',
    tags: ['horarios', 'atencion', 'horas'],
    confidence: 0.3, // Low confidence — placeholder
    active: false, // DO NOT ACTIVATE until verified
  },
  {
    category: 'store_info',
    question: 'A qué hora abren?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar horario de apertura con Kamikaze Bikes.',
    tags: ['horarios', 'apertura'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'A qué hora cierran?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar horario de cierre con Kamikaze Bikes.',
    tags: ['horarios', 'cierre'],
    confidence: 0.3,
    active: false,
  },

  // ============================================
  // STORE LOCATION — NEEDS BUSINESS VERIFICATION
  // ============================================
  {
    category: 'store_info',
    question: 'Dónde están ubicados?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: La dirección exacta debe ser confirmada con Kamikaze Bikes antes de compartirla con clientes.',
    tags: ['ubicacion', 'direccion', 'sucursal'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'Tienen más de una sucursal?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar количество de sucursales y sus direcciones con Kamikaze Bikes.',
    tags: ['sucursal', 'ubicacion'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'Cómo llego a la tienda?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Proporcionar indicaciones de transporte solo después de que Kamikaze Bikes confirme la dirección exacta.',
    tags: ['direccion', 'como_llegar', 'mapa'],
    confidence: 0.3,
    active: false,
  },

  // ============================================
  // PAYMENT METHODS — NEEDS BUSINESS VERIFICATION
  // ============================================
  {
    category: 'store_info',
    question: 'Qué medios de pago aceptan?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Los métodos de pago exactos deben ser confirmados con Kamikaze Bikes. No inventar información financiera.',
    tags: ['pago', 'tarjeta', 'efectivo', 'mercadopago'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'Puedo pagar con tarjeta?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar qué tipos de tarjeta acepta Kamikaze Bikes (débito, crédito, cuotas).',
    tags: ['tarjeta', 'pago', 'cuotas'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'Tienen financiación?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar opciones de financiación, cuotas y condiciones con Kamikaze Bikes.',
    tags: ['financiacion', 'cuotas', 'pago'],
    confidence: 0.3,
    active: false,
  },

  // ============================================
  // SHIPPING — NEEDS BUSINESS VERIFICATION
  // ============================================
  {
    category: 'store_info',
    question: 'Hacen envíos a domicilio?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar si Kamikaze Bikes ofrece envío a domicilio, zonas de cobertura y costos.',
    tags: ['envio', 'entrega', 'domicilio'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'store_info',
    question: 'Cuánto cuesta el envío?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Los costos de envío deben ser confirmados con Kamikaze Bikes antes de informar al cliente.',
    tags: ['envio', 'costo'],
    confidence: 0.3,
    active: false,
  },

  // ============================================
  // WARRANTY / RETURNS — NEEDS BUSINESS VERIFICATION
  // ============================================
  {
    category: 'policy',
    question: 'Tiene garantía la bici?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: Los términos de garantía deben ser confirmados con Kamikaze Bikes antes de informar al cliente.',
    tags: ['garantia', 'warranty'],
    confidence: 0.3,
    active: false,
  },
  {
    category: 'policy',
    question: 'Puedo devolver o cambiar la bici?',
    answer: 'NEEDS_BUSINESS_VERIFICATION: La política de devoluciones/cambios debe ser confirmada con Kamikaze Bikes antes de compartirla.',
    tags: ['devolucion', 'cambio', 'return'],
    confidence: 0.3,
    active: false,
  },

  // ============================================
  // GENERAL FAQ — Verified or Safe Defaults
  // ============================================
  {
    category: 'faq',
    question: 'Qué tipos de bicis venden?',
    answer: 'KamiKaze Bikes ofrece bicicletas de todo tipo: MTB, ruta, gravel, urbanas y playeras. Consultá con un asesor para encontrar la que mejor se adapte a tu uso y presupuesto.',
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
    answer: 'Sí, KamiKaze Bikes ofrece servicio de reparaciones. Consultá con un asesor para confirmar disponibilidad y tiempos.',
    tags: ['reparacion', 'service', 'mantenimiento'],
    confidence: 0.6,
    active: true,
  },
];

async function seed() {
  console.log('🌱 Seeding knowledge base...');

  let created = 0;
  let skipped = 0;

  for (const entry of SEED_ENTRIES) {
    // Upsert based on category + question (stable composite key)
    const existing = await prisma.knowledgeBaseEntry.findFirst({
      where: {
        category: entry.category,
        question: entry.question,
      },
    });

    if (existing) {
      console.log(`  ⏭️  Skipping (exists): [${entry.category}] ${entry.question.substring(0, 40)}...`);
      skipped++;
      continue;
    }

    await prisma.knowledgeBaseEntry.create({
      data: {
        category: entry.category,
        question: entry.question,
        answer: entry.answer,
        tags: entry.tags,
        confidence: entry.confidence,
        active: entry.active,
      },
    });

    const status = entry.active ? '✅' : '⚠️ ';
    console.log(`  ${status} Created: [${entry.category}] ${entry.question.substring(0, 40)}... (active=${entry.active})`);
    created++;
  }

  console.log(`\n📊 Seed complete: ${created} created, ${skipped} skipped`);

  const totalActive = await prisma.knowledgeBaseEntry.count({ where: { active: true } });
  const totalInactive = await prisma.knowledgeBaseEntry.count({ where: { active: false } });
  const total = await prisma.knowledgeBaseEntry.count();

  console.log(`📊 Total entries: ${total} (${totalActive} active, ${totalInactive} inactive)`);
  console.log('\n⚠️  NOTE: Entries with active=false have NEEDS_BUSINESS_VERIFICATION.');
  console.log('    Do NOT set active=true until Kamikaze Bikes has confirmed the information.');
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