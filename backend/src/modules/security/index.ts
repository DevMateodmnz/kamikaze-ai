/**
 * Security Module
 *
 * Handles security concerns across the application.
 *
 * Responsibilities:
 * - API key authentication for internal endpoints
 * - Webhook signature verification (WhatsApp)
 * - Rate limiting status
 *
 * NOT IMPLEMENTED - This is a scaffold for Phase 1
 */

export { securityRouter } from './routes.js';
export { verifyApiKey, verifyWebhookSignature } from './service.js';
