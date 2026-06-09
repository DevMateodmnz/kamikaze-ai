// Test setup - runs before each test file
// Set environment variables for tests

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.LOG_LEVEL = 'info';
process.env.INTERNAL_API_KEY = 'test-api-key-for-testing';
process.env.AI_PROVIDER = 'minimax';
process.env.AI_FALLBACK_PROVIDER = '';
process.env.AI_MIN_CONFIDENCE_THRESHOLD = '0.6';
process.env.AI_TIMEOUT_MS = '20000';
process.env.AI_MAX_TOKENS_REPLY = '400';
process.env.AI_MAX_TOKENS_INTENT = '100';
process.env.AI_REPLIES_ENABLED = 'false';
process.env.COMPANY_NAME = 'Test Company';
process.env.COMPANY_BUSINESS_TYPE = 'comercio';
process.env.MINIMAX_API_KEY = 'test-minimax-key';
process.env.MINIMAX_MODEL = 'MiniMax-Text-01';
process.env.MINIMAX_API_BASE_URL = 'https://test-api.example.com/v1';
process.env.SMTP_USER = 'test-smtp-user@example.com';
process.env.SMTP_PASS = 'test-smtp-pass';
process.env.ESCALATION_EMAIL_FROM = 'test-from@example.com';
process.env.ESCALATION_EMAIL_TO = 'test-to@example.com';
