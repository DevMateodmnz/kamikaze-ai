/**
 * Unit Tests — SMTP/Email Env Parsing
 *
 * Validates that SMTP and escalation email env vars are parsed,
 * typed, and validated correctly by the zod schema at startup.
 *
 * SMTP_USER, SMTP_PASS, ESCALATION_EMAIL_FROM, and ESCALATION_EMAIL_TO
 * are REQUIRED (no feature flag — email escalation is always active).
 * SMTP_HOST, SMTP_PORT, and SMTP_SECURE have safe defaults.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Dynamic import so vi.stubEnv() is applied before validateEnv runs
const { validateEnv } = await import('../../src/config/env.js');

describe('SMTP env vars — defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses defaults for SMTP_HOST, SMTP_PORT, SMTP_SECURE', () => {
    // Required vars must be set to pass validation
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');

    const env = validateEnv();

    expect(env.SMTP_HOST).toBe('smtp.gmail.com');
    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(false);
  });

  it('SMTP_PORT is a number, not a string', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');

    const env = validateEnv();
    expect(typeof env.SMTP_PORT).toBe('number');
  });
});

describe('SMTP env vars — custom values', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses custom SMTP_HOST', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');
    vi.stubEnv('SMTP_HOST', 'mail.mycompany.com');

    const env = validateEnv();
    expect(env.SMTP_HOST).toBe('mail.mycompany.com');
  });

  it('parses custom SMTP_PORT as number', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');
    vi.stubEnv('SMTP_PORT', '2525');

    const env = validateEnv();
    expect(env.SMTP_PORT).toBe(2525);
    expect(typeof env.SMTP_PORT).toBe('number');
  });

  it('parses SMTP_SECURE=true as boolean true', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');
    vi.stubEnv('SMTP_SECURE', 'true');

    const env = validateEnv();
    expect(env.SMTP_SECURE).toBe(true);
  });

  it('parses SMTP_SECURE=false as boolean false', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');
    vi.stubEnv('SMTP_SECURE', 'false');

    const env = validateEnv();
    expect(env.SMTP_SECURE).toBe(false);
  });

  it('parses custom SMTP_USER', () => {
    vi.stubEnv('SMTP_USER', 'alerts@mycompany.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');

    const env = validateEnv();
    expect(env.SMTP_USER).toBe('alerts@mycompany.com');
  });

  it('parses custom SMTP_PASS', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'app-password-1234');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');

    const env = validateEnv();
    expect(env.SMTP_PASS).toBe('app-password-1234');
  });

  it('parses custom ESCALATION_EMAIL_FROM', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'noreply@acme.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');

    const env = validateEnv();
    expect(env.ESCALATION_EMAIL_FROM).toBe('noreply@acme.com');
  });

  it('parses custom ESCALATION_EMAIL_TO', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'owner@acme.com');

    const env = validateEnv();
    expect(env.ESCALATION_EMAIL_TO).toBe('owner@acme.com');
  });

  it('passes with all required SMTP values set', () => {
    vi.stubEnv('SMTP_USER', 'alerts@acme.com');
    vi.stubEnv('SMTP_PASS', 'secure-app-password');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'noreply@acme.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'owner@acme.com');

    // Should not throw
    const env = validateEnv();
    expect(env.SMTP_USER).toBe('alerts@acme.com');
    expect(env.SMTP_PASS).toBe('secure-app-password');
    expect(env.ESCALATION_EMAIL_FROM).toBe('noreply@acme.com');
    expect(env.ESCALATION_EMAIL_TO).toBe('owner@acme.com');
  });
});

describe('SMTP env vars — validation errors (port)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws on invalid SMTP_PORT (non-numeric)', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');
    vi.stubEnv('SMTP_PORT', 'not-a-number');

    expect(() => validateEnv()).toThrow();
  });

  it('throws on SMTP_PORT below range', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');
    vi.stubEnv('SMTP_PORT', '0');

    expect(() => validateEnv()).toThrow();
  });

  it('throws on SMTP_PORT above range', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');
    vi.stubEnv('SMTP_PORT', '99999');

    expect(() => validateEnv()).toThrow();
  });
});

describe('SMTP env vars — missing required credentials', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when SMTP_USER is missing', () => {
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');
    delete process.env.SMTP_USER; // simulate completely absent

    expect(() => validateEnv()).toThrow(/SMTP_USER/);
  });

  it('throws when SMTP_USER is empty', () => {
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');

    expect(() => validateEnv()).toThrow(/SMTP_USER/);
  });

  it('throws when SMTP_PASS is missing', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');
    delete process.env.SMTP_PASS;

    expect(() => validateEnv()).toThrow(/SMTP_PASS/);
  });

  it('throws when SMTP_PASS is empty', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', '');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');

    expect(() => validateEnv()).toThrow(/SMTP_PASS/);
  });

  it('throws when ESCALATION_EMAIL_FROM is missing', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');
    delete process.env.ESCALATION_EMAIL_FROM;

    expect(() => validateEnv()).toThrow(/ESCALATION_EMAIL_FROM/);
  });

  it('throws when ESCALATION_EMAIL_FROM is empty', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', '');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@example.com');

    expect(() => validateEnv()).toThrow(/ESCALATION_EMAIL_FROM/);
  });

  it('throws when ESCALATION_EMAIL_TO is missing', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    delete process.env.ESCALATION_EMAIL_TO;

    expect(() => validateEnv()).toThrow(/ESCALATION_EMAIL_TO/);
  });

  it('throws when ESCALATION_EMAIL_TO is empty', () => {
    vi.stubEnv('SMTP_USER', 'test@example.com');
    vi.stubEnv('SMTP_PASS', 'test-pass');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@example.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', '');

    expect(() => validateEnv()).toThrow(/ESCALATION_EMAIL_TO/);
  });
});
