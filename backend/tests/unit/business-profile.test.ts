/**
 * Unit Tests for Business Profile Configuration
 *
 * Tests getBusinessProfile() — typed, deterministic, reads from env.
 * No secrets. No DB. No multi-tenant.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getBusinessProfile } from '../../src/config/business-profile.js';

describe('getBusinessProfile', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── Defaults ─────────────────────────────────────────────────────

  it('returns complete profile with all defaults when no env vars set', () => {
    vi.stubEnv('COMPANY_NAME', '');
    vi.stubEnv('COMPANY_BUSINESS_TYPE', '');

    const profile = getBusinessProfile();

    expect(profile.companyName).toBe('Mi Empresa');
    expect(profile.businessType).toBe('comercio');
    expect(profile.hours).toBeTruthy();
    expect(profile.location).toBeTruthy();
    expect(profile.paymentMethods).toBeTruthy();
    expect(profile.shippingPolicy).toBeTruthy();
    expect(profile.warrantyPolicy).toBeTruthy();
  });

  it('has expected keys in the profile object', () => {
    const profile = getBusinessProfile();

    expect(Object.keys(profile).sort()).toEqual([
      'businessType',
      'companyName',
      'hours',
      'location',
      'paymentMethods',
      'shippingPolicy',
      'warrantyPolicy',
    ]);
  });

  // ── COMPANY_NAME ─────────────────────────────────────────────────

  it('uses COMPANY_NAME from env', () => {
    vi.stubEnv('COMPANY_NAME', 'Acme Bikes');

    const profile = getBusinessProfile();

    expect(profile.companyName).toBe('Acme Bikes');
  });

  it('uses COMPANY_BUSINESS_TYPE from env', () => {
    vi.stubEnv('COMPANY_BUSINESS_TYPE', 'tienda de bicicletas');

    const profile = getBusinessProfile();

    expect(profile.businessType).toBe('tienda de bicicletas');
  });

  // ── COMPANY_HOURS ────────────────────────────────────────────────

  it('uses COMPANY_HOURS from env to override default', () => {
    vi.stubEnv('COMPANY_HOURS', 'L a V de 10 a 18');

    const profile = getBusinessProfile();

    expect(profile.hours).toBe('L a V de 10 a 18');
  });

  it('returns default hours when COMPANY_HOURS is empty', () => {
    vi.stubEnv('COMPANY_HOURS', '');

    const profile = getBusinessProfile();

    expect(profile.hours).toBeTruthy();
    // Default should mention lunes a sábado
    expect(profile.hours).toMatch(/lunes/i);
  });

  // ── COMPANY_LOCATION ─────────────────────────────────────────────

  it('uses COMPANY_LOCATION from env to override default', () => {
    vi.stubEnv('COMPANY_LOCATION', 'CABA, Argentina');

    const profile = getBusinessProfile();

    expect(profile.location).toBe('CABA, Argentina');
  });

  // ── COMPANY_PAYMENT_METHODS ──────────────────────────────────────

  it('uses COMPANY_PAYMENT_METHODS from env to override default', () => {
    vi.stubEnv('COMPANY_PAYMENT_METHODS', 'Efectivo y transferencia');

    const profile = getBusinessProfile();

    expect(profile.paymentMethods).toBe('Efectivo y transferencia');
  });

  // ── COMPANY_SHIPPING_POLICY ──────────────────────────────────────

  it('uses COMPANY_SHIPPING_POLICY from env to override default', () => {
    vi.stubEnv('COMPANY_SHIPPING_POLICY', 'Envíos a todo el país');

    const profile = getBusinessProfile();

    expect(profile.shippingPolicy).toBe('Envíos a todo el país');
  });

  // ── COMPANY_WARRANTY_POLICY ──────────────────────────────────────

  it('uses COMPANY_WARRANTY_POLICY from env to override default', () => {
    vi.stubEnv('COMPANY_WARRANTY_POLICY', '2 años de garantía');

    const profile = getBusinessProfile();

    expect(profile.warrantyPolicy).toBe('2 años de garantía');
  });

  // ── Kamikaze defaults (legacy behavior) ──────────────────────────

  it('default hours match Kamikaze legacy hours', () => {
    const profile = getBusinessProfile();

    expect(profile.hours).toContain('9 a 13');
    expect(profile.hours).toContain('17 a 20');
  });

  it('default location matches Kamikaze legacy location', () => {
    const profile = getBusinessProfile();

    expect(profile.location).toContain('San Miguel de Tucumán');
  });

  it('default payment methods mention Kamikaze legacy options', () => {
    const profile = getBusinessProfile();

    expect(profile.paymentMethods).toMatch(/efectivo|tarjeta|MercadoPago/i);
  });
});
