import type { FastifyPluginAsync } from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createTransport } from 'nodemailer';
import { verifyApiKey } from '../../modules/security/service.js';

function nonEmptyOr(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify detects async plugins at runtime.
export const internalRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Auth gate: all internal endpoints require X-API-Key header
  app.addHook('preHandler', verifyApiKey);

  app.post('/send-email', {
    config: { internal: true },
  }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>;
    const { escalationId, subject, bodyHtml } = body;

    if (!escalationId || !subject || !bodyHtml) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: escalationId, subject, bodyHtml',
      });
    }

    const transporter = createTransport({
      host: nonEmptyOr(process.env.SMTP_HOST, 'smtp.gmail.com'),
      port: parseInt(nonEmptyOr(process.env.SMTP_PORT, '587'), 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '' },
    });

    try {
      const info = await transporter.sendMail({
        from: process.env.ESCALATION_EMAIL_FROM ?? '',
        to: process.env.ESCALATION_EMAIL_TO ?? '',
        subject,
        html: bodyHtml,
      });
      return reply.send({ success: true, escalationId, messageId: info.messageId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email error';
      app.log.error({ escalationId, error: message }, 'Email send failed');
      return reply.status(502).send({ success: false, escalationId, error: message });
    }
  });
};
