/**
 * Security Module
 *
 * Handles security concerns across the application.
 *
 * Implemented:
 * - API key authentication for internal endpoints (verifyApiKey)
 * - Webhook signature verification — WhatsApp Cloud API (verifyWebhookSignature)
 * - WhatsApp webhook GET/POST routes (hub.challenge + HMAC validation)
 *
 * Future:
 * - Rate limiting
 */

export { securityRouter } from './routes.js';
export { verifyApiKey, verifyWebhookSignature } from './service.js';
