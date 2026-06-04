import { z } from 'zod';
import type { Env } from '../types/index.js';

// Schema validation for environment variables
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),

  // API Key
  INTERNAL_API_KEY: z.string().min(20).default('dev-internal-api-key-change-in-production'),

  // WhatsApp (disabled by default)
  WHATSAPP_ENABLED: z.coerce.boolean().default(false),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_WEBHOOK_PATH: z.string().default('/api/v1/whatsapp/webhook'),

  // AI Gateway
  AI_PROVIDER: z.enum(['minimax', 'openai', 'gemini', 'anthropic', 'local']).default('minimax'),
  AI_FALLBACK_PROVIDER: z.enum(['minimax', 'openai', 'gemini', 'anthropic', 'local', '']).optional().default(''),
  AI_MIN_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20000),
  AI_MAX_TOKENS_REPLY: z.coerce.number().int().min(50).max(4000).default(400),
  AI_MAX_TOKENS_INTENT: z.coerce.number().int().min(10).max(500).default(100),

  // AI-generated replies (disabled by default — enable only after safety review)
  AI_REPLIES_ENABLED: z.coerce.boolean().default(false),

  // Company identity (generic — override per deployment)
  COMPANY_NAME: z.string().default('Mi Empresa'),
  COMPANY_BUSINESS_TYPE: z.string().default('comercio'),

  // Escalation
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  ESCALATION_CHANNEL_ID: z.string().optional(),

  // CORS
  CORS_ORIGINS: z.string().optional(),
});

let cachedEnv: Env | null = null;

export function validateEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const rawEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    LOG_LEVEL: process.env.LOG_LEVEL,
    DATABASE_URL: process.env.DATABASE_URL,
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
    WHATSAPP_ENABLED: process.env.WHATSAPP_ENABLED,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION,
    WHATSAPP_WEBHOOK_PATH: process.env.WHATSAPP_WEBHOOK_PATH,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_FALLBACK_PROVIDER: process.env.AI_FALLBACK_PROVIDER,
    AI_MIN_CONFIDENCE_THRESHOLD: process.env.AI_MIN_CONFIDENCE_THRESHOLD,
    AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS,
    AI_MAX_TOKENS_REPLY: process.env.AI_MAX_TOKENS_REPLY,
    AI_MAX_TOKENS_INTENT: process.env.AI_MAX_TOKENS_INTENT,
    AI_REPLIES_ENABLED: process.env.AI_REPLIES_ENABLED,
    COMPANY_NAME: process.env.COMPANY_NAME,
    COMPANY_BUSINESS_TYPE: process.env.COMPANY_BUSINESS_TYPE,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    ESCALATION_CHANNEL_ID: process.env.ESCALATION_CHANNEL_ID,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Invalid environment variables: ${errors}`);
  }

  cachedEnv = result.data as Env;
  return cachedEnv;
}

export const env = validateEnv();
