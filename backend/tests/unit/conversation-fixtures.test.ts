/**
 * Unit Tests — Conversation Flow Fixture Validation
 *
 * Validates data/manual-test-fixtures/whatsapp-conversation-flow.example.json
 * Static checks only — no runtime, no DB, no network.
 *
 * Run standalone: npx vitest run tests/unit/conversation-fixtures.test.ts
 * Or via script:  npm run check:fixtures
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Fixture shape types
// ---------------------------------------------------------------------------

interface FixtureEntry {
  _scenario?: string;
  _description?: string;
  whatsappMessageId?: string;
  from?: string;
  text?: string;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Load fixture
// ---------------------------------------------------------------------------

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  scriptDir,
  '../../../data/manual-test-fixtures/whatsapp-conversation-flow.example.json'
);

let entries: FixtureEntry[] = [];

describe('Conversation flow fixture validation', () => {
  // ── File existence and parse ──────────────────────────────────────

  it('fixture file exists', () => {
    expect(existsSync(fixturePath)).toBe(true);
  });

  it('fixture file is valid JSON and is a non-empty array', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    entries = parsed;
  });

  // ── Required fields ───────────────────────────────────────────────

  it('every entry has a "from" field (string, non-empty)', () => {
    for (const e of entries) {
      expect(typeof e.from).toBe('string');
      expect(e.from.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a "text" field (string, non-empty)', () => {
    for (const e of entries) {
      expect(typeof e.text).toBe('string');
      expect(e.text.length).toBeGreaterThan(0);
    }
  });

  it('every entry has an optional "_scenario" field for documentation', () => {
    for (const e of entries) {
      // _scenario is optional but strongly recommended
      if (e._scenario) {
        expect(typeof e._scenario).toBe('string');
      }
    }
  });

  // ── Fake phone numbers (no real data) ─────────────────────────────

  it('all phone numbers use fake +549000000000X prefix', () => {
    for (const e of entries) {
      expect(e.from).toMatch(/^\+54900000000\d{2}$/);
    }
  });

  // ── No secrets ─────────────────────────────────────────────────────

  it('no entry contains API keys or secret patterns', () => {
    const allText = entries
      .map((e) => (e.from ?? '') + (e.text ?? ''))
      .join(' ');
    expect(allText).not.toMatch(/api[_-]?key/i);
    expect(allText).not.toMatch(/sk-/i);
    expect(allText).not.toMatch(/MINIMAX/i);
    expect(allText).not.toMatch(/Bearer\s/i);
  });

  // ── No real business data ──────────────────────────────────────────

  it('no entry contains NEEDS_BUSINESS_VERIFICATION placeholder (that belongs in KB, not fixtures)', () => {
    for (const e of entries) {
      expect(e.text ?? '').not.toMatch(/NEEDS_BUSINESS_VERIFICATION/);
      expect(e.from ?? '').not.toMatch(/NEEDS_BUSINESS_VERIFICATION/);
    }
  });

  // ── Unique scenario IDs ────────────────────────────────────────────

  it('_scenario values are unique', () => {
    const scenarios = entries
      .map((e) => e._scenario)
      .filter((s): s is string => typeof s === 'string');
    const unique = new Set(scenarios);
    expect(unique.size).toBe(scenarios.length);
    if (scenarios.length !== unique.size) {
      // Report duplicates
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const s of scenarios) {
        if (seen.has(s)) dupes.add(s);
        seen.add(s);
      }
      console.warn('Duplicate _scenario values:', [...dupes]);
    }
  });

  // ── Duplicate idempotency scenario ─────────────────────────────────

  it('the idempotency scenario has a fixed whatsappMessageId', () => {
    const dupEntry = entries.find(
      (e) => e._scenario === '16-duplicate-idempotency'
    );
    expect(dupEntry).toBeDefined();
    expect(dupEntry!.whatsappMessageId).toBe('fixture-test-dup-00001');
  });

  // ── Multi-turn scenario uses consistent phone ──────────────────────

  it('multi-turn scenario entries share the same phone number', () => {
    const multiTurn = entries.filter((e) =>
      e._scenario?.startsWith('17-') ||
      e._scenario?.startsWith('18-') ||
      e._scenario?.startsWith('19-')
    );
    expect(multiTurn.length).toBe(3);
    const phones = new Set(multiTurn.map((e) => e.from));
    expect(phones.size).toBe(1); // all same phone
  });

  // ── Coverage: all major intent categories represented ─────────────

  it('covers reply intents (greeting, product_interest, store_hours, thanks, goodbye)', () => {
    const scenarios = entries.map((e) => e._scenario);
    expect(scenarios.some((s) => s?.includes('greeting'))).toBe(true);
    expect(scenarios.some((s) => s?.includes('product-interest'))).toBe(true);
    expect(scenarios.some((s) => s?.includes('store-hours'))).toBe(true);
    expect(scenarios.some((s) => s?.includes('thanks'))).toBe(true);
    expect(scenarios.some((s) => s?.includes('goodbye'))).toBe(true);
  });

  it('covers escalation intents (complaint, human_request, warranty, stock, price, discount)', () => {
    const scenarios = entries.map((e) => e._scenario);
    expect(scenarios.some((s) => s?.includes('complaint'))).toBe(true);
    expect(scenarios.some((s) => s?.includes('human-request'))).toBe(true);
    expect(scenarios.some((s) => s?.includes('warranty'))).toBe(true);
    expect(scenarios.some((s) => s?.includes('stock'))).toBe(true);
    expect(scenarios.some((s) => s?.includes('price'))).toBe(true);
    expect(scenarios.some((s) => s?.includes('discount'))).toBe(true);
  });

  it('covers edge cases (duplicate idempotency, multi-turn conversation)', () => {
    const scenarios = entries.map((e) => e._scenario);
    expect(scenarios.some((s) => s?.includes('duplicate'))).toBe(true);
    expect(scenarios.some((s) => s?.includes('conversation-sequence'))).toBe(true);
  });

  // ── Structural: timestamps are numeric strings ─────────────────────

  it('all timestamp values are numeric strings when present', () => {
    for (const e of entries) {
      if (e.timestamp) {
        expect(e.timestamp).toMatch(/^\d+$/);
      }
    }
  });
});
