/**
 * Unit Tests for Health Endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { healthRoutes } from '../../src/routes/health.routes.js';

describe('Health Endpoints', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();
    void app.register(healthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status - database may or may not be available', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      const body = JSON.parse(response.body);
      expect(body.status).toBeDefined();
      expect(body.checks).toBeDefined();
      expect(body.checks.database).toBeDefined();

      // If database is not available, status will be 'error' and statusCode 503
      // If database is available, status will be 'ok' and statusCode 200
      if (body.checks.database === 'ok') {
        expect(response.statusCode).toBe(200);
        expect(body.status).toBe('ok');
      } else {
        expect(response.statusCode).toBe(503);
        expect(body.status).toBe('error');
      }
    });
  });
});
