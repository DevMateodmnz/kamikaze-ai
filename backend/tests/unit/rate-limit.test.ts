/**
 * Unit Tests for Rate Limiting
 *
 * Tests @fastify/rate-limit plugin behavior on protected routes.
 * Uses Fastify app.inject() — no real network calls.
 * No secrets required.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

// Build a minimal test app with rate limiting
async function buildRateLimitedApp(max: number, timeWindow: string) {
  const app = Fastify({ logger: false });

  await app.register(rateLimit, {
    max,
    timeWindow,
    keyGenerator: (req) => {
      // Use a fixed key per test to avoid interference
      return req.ip;
    },
  });

  app.get('/test', async (_req, reply) => {
    return reply.send({ ok: true });
  });

  await app.ready();
  return app;
}

describe('Rate Limiting', () => {
  let app: ReturnType<typeof Fastify>;

  afterAll(async () => {
    if (app) await app.close();
  });

  it('allows requests below the limit', async () => {
    app = await buildRateLimitedApp(5, '1m');

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 429 when limit is exceeded', async () => {
    app = await buildRateLimitedApp(2, '1m');

    // Consume the limit
    await app.inject({ method: 'GET', url: '/test' });
    await app.inject({ method: 'GET', url: '/test' });

    // This one should be rate-limited
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(429);
  });

  it('returns rate limit headers on responses', async () => {
    app = await buildRateLimitedApp(10, '1m');

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);

    // @fastify/rate-limit includes standard headers
    const headers = res.headers;
    expect(headers['x-ratelimit-limit']).toBeDefined();
    expect(headers['x-ratelimit-remaining']).toBeDefined();
    expect(headers['x-ratelimit-reset']).toBeDefined();
  });

  it('does not expose internal state in 429 response', async () => {
    app = await buildRateLimitedApp(0, '1m');

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(429);

    const body = JSON.parse(res.body);
    // Must not leak secrets, config, or internal state
    expect(body).not.toHaveProperty('apiKey');
    expect(body).not.toHaveProperty('secret');
    expect(body).not.toHaveProperty('config');
    expect(body.message || body.error).toBeDefined();
  });
});
