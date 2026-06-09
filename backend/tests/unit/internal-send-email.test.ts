/**
 * Unit Tests — Internal Send-Email Endpoint
 *
 * Tests POST /api/v1/internal/send-email behavior:
 * auth enforcement, success, validation errors, SMTP failures.
 *
 * Uses Fastify app.inject() — no real network calls.
 * Nodemailer is mocked — no real emails are sent.
 * SMTP env vars already validated by PR #1.
 * X-API-Key auth added by PR #2.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import Fastify from 'fastify';

// ── Mock nodemailer ────────────────────────────────────────────────

const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({
  sendMail: mockSendMail,
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

// Dynamic import AFTER mock is in place
const { internalRouter } = await import('../../src/routes/api/internal.js');

// ── Test helpers ───────────────────────────────────────────────────

const VALID_API_KEY = 'test-api-key-for-testing'; // from tests/setup.ts
const VALID_HEADERS = { 'x-api-key': VALID_API_KEY };

const validBody = {
  escalationId: 'esc-test-001',
  subject: 'Test Escalation',
  bodyHtml: '<p>Test email body</p>',
};

// ── Test app ───────────────────────────────────────────────────────

describe('POST /send-email', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    void app.register(internalRouter);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth enforcement ──────────────────────────────────────────

  describe('auth', () => {
    it('returns 401 when X-API-Key header is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: validBody,
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Missing X-API-Key');
    });

    it('returns 401 when X-API-Key is invalid', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: validBody,
        headers: { 'x-api-key': 'wrong-key' },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Invalid X-API-Key');
    });

    it('returns 401 for missing body fields even without auth', async () => {
      // Auth runs first — missing key is rejected before body validation
      const res = await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: {},
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── Success (with valid auth) ──────────────────────────────────

  describe('success', () => {
    it('returns 200 with messageId on successful send', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: '<test-msg-id@example.com>' });

      const res = await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: validBody,
        headers: VALID_HEADERS,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.escalationId).toBe('esc-test-001');
      expect(body.messageId).toBe('<test-msg-id@example.com>');
    });

    it('calls nodemailer sendMail with correct envelope', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: '<msg-002>' });

      await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: validBody,
        headers: VALID_HEADERS,
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOpts = mockSendMail.mock.calls[0][0];
      expect(mailOpts.subject).toBe('Test Escalation');
      expect(mailOpts.html).toBe('<p>Test email body</p>');
      expect(mailOpts.from).toBeTruthy();
      expect(mailOpts.to).toBeTruthy();
    });

    it('uses configured ESCALATION_EMAIL_FROM and ESCALATION_EMAIL_TO', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: '<msg-003>' });

      await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: validBody,
        headers: VALID_HEADERS,
      });

      const mailOpts = mockSendMail.mock.calls[0][0];
      expect(mailOpts.from).toBe('test-from@example.com');
      expect(mailOpts.to).toBe('test-to@example.com');
    });
  });

  // ── Validation errors (with valid auth) ────────────────────────

  describe('validation', () => {
    it('returns 400 when escalationId is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: { subject: 'S', bodyHtml: '<p>B</p>' },
        headers: VALID_HEADERS,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('escalationId');
    });

    it('returns 400 when subject is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: { escalationId: 'e1', bodyHtml: '<p>B</p>' },
        headers: VALID_HEADERS,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('subject');
    });

    it('returns 400 when bodyHtml is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: { escalationId: 'e1', subject: 'S' },
        headers: VALID_HEADERS,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('bodyHtml');
    });

    it('returns 400 when body is empty', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: {},
        headers: VALID_HEADERS,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
    });
  });

  // ── SMTP failure (with valid auth) ─────────────────────────────

  describe('smtp failure', () => {
    it('returns 502 when nodemailer throws', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      const res = await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: validBody,
        headers: VALID_HEADERS,
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.escalationId).toBe('esc-test-001');
      expect(body.error).toContain('SMTP connection refused');
    });

    it('returns 502 when nodemailer rejects with non-Error', async () => {
      mockSendMail.mockRejectedValueOnce('some string error');

      const res = await app.inject({
        method: 'POST',
        url: '/send-email',
        payload: validBody,
        headers: VALID_HEADERS,
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Unknown email error');
    });
  });
});
