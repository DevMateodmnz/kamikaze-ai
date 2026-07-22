import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { HealthStatus, ReadinessStatus } from '../types/index.js';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';

const startTime = Date.now();

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify detects async plugins at runtime.
export const healthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Basic liveness check
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const status: HealthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };
    return reply.send(status);
  });

  // Readiness check (validates DB connectivity)
  app.get('/health/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    let dbStatus: 'ok' | 'error' = 'error';

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'ok';
    } catch {
      dbStatus = 'error';
    }

    const isReady = dbStatus === 'ok';
    const status: ReadinessStatus = {
      status: isReady ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks: {
        database: dbStatus,
      },
    };

    if (!isReady) {
      return reply.status(503).send(status);
    }

    return reply.send(status);
  });

  // Development-only: dump env (masked)
  if (env.NODE_ENV === 'development') {
    app.get('/health/env', async (_request: FastifyRequest, reply: FastifyReply) => {
      const maskedEnv = {
        NODE_ENV: env.NODE_ENV,
        PORT: env.PORT,
        DATABASE_URL: env.DATABASE_URL ? '***' : undefined,
        WHATSAPP_ENABLED: env.WHATSAPP_ENABLED,
        AI_PROVIDER: env.AI_PROVIDER,
        AI_MIN_CONFIDENCE_THRESHOLD: env.AI_MIN_CONFIDENCE_THRESHOLD,
      };
      return reply.send(maskedEnv);
    });
  }
};
