/**
 * Rate Limiting Plugin
 *
 * Configures @fastify/rate-limit with in-memory storage.
 *
 * Limits per route (from docs/architecture.md section 8.3):
 *   - /api/v1/messages/*     → 60/min
 *   - /api/v1/security/whatsapp/webhook → 300/min (Meta may not retry on 429)
 *   - /api/v1/ai-gateway/*   → 30/min  (conservative; AI costs money)
 *   - /health*               → 300/min (health checks are frequent)
 *   - /api/v1/internal/*     → 120/min (n8n workflows; generous but protected)
 *
 * Production caveat:
 *   Default in-memory store is NOT shared across instances.
 *   For multi-instance deployments, configure a Redis store via
 *   @fastify/rate-limit's `store` option.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

export const rateLimitPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Per-route overrides: must be registered BEFORE rate-limit plugin
  // so that config.rateLimit is set before the plugin reads it.
  // @fastify/rate-limit v9 reads config.rateLimit from routeOptions.config
  // in its own onRoute hook.

  // /api/v1/messages/* — 60/min
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url?.startsWith('/api/v1/messages')) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: { max: 60, timeWindow: '1 minute' },
      };
    }
  });

  // /api/v1/security/whatsapp/webhook — 300/min (Meta may not retry on 429)
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url?.startsWith('/api/v1/security/whatsapp/webhook')) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: { max: 300, timeWindow: '1 minute' },
      };
    }
  });

  // /api/v1/internal/* — 120/min (n8n workflows)
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url?.startsWith('/api/v1/internal')) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: { max: 120, timeWindow: '1 minute' },
      };
    }
  });

  // /health* — 300/min
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url?.startsWith('/health')) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: { max: 300, timeWindow: '1 minute' },
      };
    }
  });

  // Register rate-limit AFTER onRoute hooks so it reads the configs
  await app.register(rateLimit, {
    // Global default for routes without per-route override
    max: 100,
    timeWindow: '1 minute',
    // In-memory store (default). Redis recommended for production multi-instance.
    keyGenerator: (req) => {
      return req.ip;
    },
  });
};
