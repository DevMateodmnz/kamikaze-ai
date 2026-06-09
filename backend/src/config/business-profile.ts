/**
 * Business Profile Configuration
 *
 * Centralizes company identity and non-secret business facts
 * that appear in customer-facing replies. Reads from environment
 * variables with legacy Kamikaze defaults for backward compatibility.
 *
 * Single-tenant: one deployment = one business profile.
 * No DB. No multi-tenant. No secrets.
 */

/**
 * Typed business profile with all customer-visible identity fields.
 * All values are plain strings — no secrets, no credentials.
 */
export interface BusinessProfile {
  /** Company name as it appears in customer replies (e.g. "Kamikaze Bikes") */
  companyName: string;
  /** Business category (e.g. "bicicletería", "comercio", "tienda de ropa") */
  businessType: string;
  /** Store hours displayed to customers (e.g. "lunes a sábado de 9 a 13 y de 17 a 20") */
  hours: string;
  /** Store location displayed to customers (e.g. "San Miguel de Tucumán") */
  location: string;
  /** Payment methods displayed to customers */
  paymentMethods: string;
  /** Shipping policy displayed to customers */
  shippingPolicy: string;
  /** Warranty / returns policy displayed to customers */
  warrantyPolicy: string;
  /** Product categories shown in product-interest replies (comma-separated, e.g. "MTB, ruta, gravel, ciudad") */
  productCategories: string;
}

// ── Legacy Kamikaze defaults ────────────────────────────────────────
// These match the previous hardcoded values in decision-engine.ts
// so existing behavior is preserved when no overrides are set.

const DEFAULT_HOURS = 'lunes a sábado de 9 a 13 y de 17 a 20. Domingos cerrado';
const DEFAULT_LOCATION = 'San Miguel de Tucumán';
const DEFAULT_PAYMENT_METHODS =
  'Aceptamos efectivo, tarjeta de débito y crédito, MercadoPago y transferencia bancaria. También tenemos financiacion en hasta 12 cuotas. Consultá con un asesor para más detalles.';
const DEFAULT_SHIPPING_POLICY =
  'Los envíos se coordinan directamente con un asesor. Consultá por tu zona para confirmar disponibilidad y costo.';
const DEFAULT_WARRANTY_POLICY =
  'Consultá con un asesor sobre garantía y devoluciones.';
const DEFAULT_PRODUCT_CATEGORIES = 'MTB, ruta, gravel, ciudad';

/**
 * Build a typed BusinessProfile from environment variables.
 *
 * Reads COMPANY_NAME, COMPANY_BUSINESS_TYPE and optional overrides
 * for hours, location, payment methods, shipping, and warranty.
 *
 * When no override is set, falls back to Kamikaze legacy defaults
 * to preserve backward compatibility.
 *
 * Pure function — no side effects. No DB access. No secrets.
 */
export function getBusinessProfile(): BusinessProfile {
  /* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
  return {
    companyName: process.env.COMPANY_NAME || 'Mi Empresa',
    businessType: process.env.COMPANY_BUSINESS_TYPE || 'comercio',
    hours: process.env.COMPANY_HOURS || DEFAULT_HOURS,
    location: process.env.COMPANY_LOCATION || DEFAULT_LOCATION,
    paymentMethods: process.env.COMPANY_PAYMENT_METHODS || DEFAULT_PAYMENT_METHODS,
    shippingPolicy: process.env.COMPANY_SHIPPING_POLICY || DEFAULT_SHIPPING_POLICY,
    warrantyPolicy: process.env.COMPANY_WARRANTY_POLICY || DEFAULT_WARRANTY_POLICY,
    productCategories: process.env.COMPANY_PRODUCT_CATEGORIES || DEFAULT_PRODUCT_CATEGORIES,
  };
  /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
}
