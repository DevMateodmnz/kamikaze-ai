import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance } from 'fastify';

// Module routes
import { messagesRouter } from '../../modules/messages/routes.js';
import { conversationsRouter } from '../../modules/conversations/routes.js';
import { customersRouter } from '../../modules/customers/routes.js';
import { knowledgeBaseRouter } from '../../modules/knowledge-base/routes.js';
import { escalationsRouter } from '../../modules/escalations/routes.js';
import { analyticsRouter } from '../../modules/analytics/routes.js';
import { securityRouter } from '../../modules/security/routes.js';

export const apiRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Placeholder ping endpoint
  app.get('/ping', async () => ({ pong: true, timestamp: new Date().toISOString() }));

  // Register module routes (all return 501 Not Implemented in scaffold)
  void app.register(messagesRouter, { prefix: '/messages' });
  void app.register(conversationsRouter, { prefix: '/conversations' });
  void app.register(customersRouter, { prefix: '/customers' });
  void app.register(knowledgeBaseRouter, { prefix: '/knowledge-base' });
  void app.register(escalationsRouter, { prefix: '/escalations' });
  void app.register(analyticsRouter, { prefix: '/analytics' });
  void app.register(securityRouter, { prefix: '/security' });

  // AI Gateway - internal only, not exposed as routes
  // Will be called by n8n via POST /api/v1/messages/inbound
};
