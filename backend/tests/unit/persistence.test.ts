/**
 * Persistence Tests
 *
 * Tests for customers, conversations, and messages services.
 *
 * Structure:
 * - Unit tests (no DB): phone normalization, schema validation — always run
 * - Integration tests (real DB): full persistence flow — only when DB is available
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { normalizePhone, isValidPhone, customersService } from '../../src/modules/customers/service.js';
import { conversationsService } from '../../src/modules/conversations/service.js';
import { messagesService } from '../../src/modules/messages/service.js';

// Use real E.164-format Argentine phone numbers for all tests
const VALID_TEST_PHONE = '+5493812345678';
const VALID_TEST_PHONE_2 = '+5493812345679';

// DB availability check
let dbAvailable = false;

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Unit tests (no DB required)
// ---------------------------------------------------------------------------

describe('Phone Normalization', () => {
  it('should normalize 0-prefixed Argentine number to E.164', () => {
    expect(normalizePhone('03812345678')).toBe('+543812345678');
    expect(normalizePhone('0 381 234 5678')).toBe('+543812345678');
  });

  it('should add + prefix to plain digits', () => {
    expect(normalizePhone('5493812345678')).toBe('+5493812345678');
  });

  it('should keep existing + prefix', () => {
    expect(normalizePhone('+5493812345678')).toBe('+5493812345678');
  });

  it('should remove spaces and dashes', () => {
    expect(normalizePhone('+54 9 381 234 5678')).toBe('+5493812345678');
    expect(normalizePhone('+54-381-234-5678')).toBe('+543812345678'); // Note: this is +54-381 not +54-9-381
  });

  it('should handle phone with leading zeros in area code', () => {
    expect(normalizePhone('038112345678')).toBe('+5438112345678');
  });

  it('should handle mobile with 9 after country code', () => {
    expect(normalizePhone('+549381234567')).toBe('+549381234567');
  });
});

describe('Phone Validation', () => {
  it('should accept valid E.164 Argentine numbers', () => {
    expect(isValidPhone('+543812345678')).toBe(true);
    expect(isValidPhone('+5493812345678')).toBe(true);
  });

  it('should reject invalid formats', () => {
    expect(isValidPhone('not-a-phone')).toBe(false);
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('123')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration tests (DB required) — skip gracefully when DB unavailable
// ---------------------------------------------------------------------------

describe('Customer Persistence', () => {
  beforeAll(async () => {
    dbAvailable = await checkDb();
  });

  // Clean up helper — only runs if DB available
  afterAll(async () => {
    if (!dbAvailable) return;
    try {
      await prisma.customer.deleteMany({
        where: { phone: { startsWith: '+5493812345' } },
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create new customer when phone is new', async () => {
    if (!dbAvailable) return;

    // Use a truly unique phone each run
    const uniquePhone = `+549381${String(Date.now() % 10000000).padStart(7, '0')}`;
    const customer = await customersService.identifyCustomer(uniquePhone);

    expect(customer.id).toBeDefined();
    expect(customer.phone).toBe(uniquePhone);
    expect(customer.name).toBeNull();
    expect(customer.optedOut).toBe(false);
  });

  it('should reuse existing customer when phone already exists', async () => {
    if (!dbAvailable) return;

    const uniquePhone = `+549381${String((Date.now() % 10000000) + 1).padStart(7, '0')}`;
    const first = await customersService.identifyCustomer(uniquePhone);
    const second = await customersService.identifyCustomer(uniquePhone);

    expect(first.id).toBe(second.id);
    expect(first.phone).toBe(second.phone);
  });

  it('should return null for non-existent customer', async () => {
    if (!dbAvailable) return;

    const result = await customersService.getCustomerById('non-existent-id');
    expect(result).toBeNull();
  });

  it('should update customer name', async () => {
    if (!dbAvailable) return;

    const uniquePhone = `+549381${String((Date.now() % 10000000) + 2).padStart(7, '0')}`;
    const customer = await customersService.identifyCustomer(uniquePhone);

    await customersService.updateCustomerName(customer.id, 'Test Customer');
    const updated = await customersService.getCustomerById(customer.id);

    expect(updated?.name).toBe('Test Customer');
  });
});

describe('Conversation Persistence', () => {
  let customerId: string;

  beforeAll(async () => {
    dbAvailable = await checkDb();
    if (dbAvailable) {
      const customer = await customersService.identifyCustomer(VALID_TEST_PHONE);
      customerId = customer.id;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    try {
      await prisma.conversation.deleteMany({
        where: { customer: { phone: VALID_TEST_PHONE } },
      });
    } catch {
      // Ignore
    }
  });

  it('should create new active conversation for customer', async () => {
    if (!dbAvailable) return;

    const conv = await conversationsService.getOrCreateConversation(customerId);

    expect(conv.id).toBeDefined();
    expect(conv.customerId).toBe(customerId);
    expect(conv.status).toBe('ACTIVE');
    expect(conv.messageCount).toBe(0);
  });

  it('should reuse existing active conversation for same customer', async () => {
    if (!dbAvailable) return;

    const first = await conversationsService.getOrCreateConversation(customerId);
    const second = await conversationsService.getOrCreateConversation(customerId);

    expect(first.id).toBe(second.id);
  });

  it('should return null for non-existent conversation', async () => {
    if (!dbAvailable) return;

    const result = await conversationsService.getConversationById('non-existent-id');
    expect(result).toBeNull();
  });

  it('should return existing conversation by ID', async () => {
    if (!dbAvailable) return;

    const created = await conversationsService.getOrCreateConversation(customerId);
    const found = await conversationsService.getConversationById(created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it('should close conversation and create new active on next getOrCreate', async () => {
    if (!dbAvailable) return;

    const active = await conversationsService.getOrCreateConversation(customerId);
    await conversationsService.updateConversationStatus(active.id, 'CLOSED');

    const newActive = await conversationsService.getOrCreateConversation(customerId);

    expect(newActive.id).not.toBe(active.id);
    expect(newActive.status).toBe('ACTIVE');
  });
});

describe('Message Persistence', () => {
  let conversationId: string;

  beforeAll(async () => {
    dbAvailable = await checkDb();
    if (dbAvailable) {
      const customer = await customersService.identifyCustomer(VALID_TEST_PHONE_2);
      const conv = await conversationsService.getOrCreateConversation(customer.id);
      conversationId = conv.id;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    try {
      await prisma.message.deleteMany({
        where: { conversation: { customer: { phone: VALID_TEST_PHONE_2 } } },
      });
      await prisma.conversation.deleteMany({
        where: { customer: { phone: VALID_TEST_PHONE_2 } },
      });
      await prisma.customer.deleteMany({
        where: { phone: VALID_TEST_PHONE_2 },
      });
    } catch {
      // Ignore
    }
  });

  it('should store inbound message and create customer+conversation', async () => {
    if (!dbAvailable) return;

    const uniqueId = `inbound-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await messagesService.storeInboundMessage({
      whatsappMessageId: `wamid-${uniqueId}`,
      from: VALID_TEST_PHONE_2,
      text: 'Hola, busco una bici MTB',
      timestamp: '1717000000',
    });

    expect(result.customer.id).toBeDefined();
    expect(result.conversation.id).toBeDefined();
    expect(result.message.id).toBeDefined();
    expect(result.message.direction).toBe('INBOUND');
    expect(result.duplicate).toBe(false);
  });

  it('should return duplicate=true for same whatsappMessageId', async () => {
    if (!dbAvailable) return;

    const uniqueId = `dup-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const first = await messagesService.storeInboundMessage({
      whatsappMessageId: `wamid-dup-${uniqueId}`,
      from: VALID_TEST_PHONE_2,
      text: 'First message',
    });

    const second = await messagesService.storeInboundMessage({
      whatsappMessageId: `wamid-dup-${uniqueId}`,
      from: VALID_TEST_PHONE_2,
      text: 'Second message (should not be stored)',
    });

    expect(second.duplicate).toBe(true);
    expect(second.message.id).toBe(first.message.id);
  });

  it('should store outbound message with AI metadata', async () => {
    if (!dbAvailable) return;

    const message = await messagesService.storeOutboundMessage({
      conversationId,
      content: 'Buenas! Tenemos varias MTB en stock.',
      intent: 'product_inquiry',
      confidence: 0.85,
      aiProvider: 'minimax',
      tokensUsed: 150,
    });

    expect(message.id).toBeDefined();
    expect(message.direction).toBe('OUTBOUND');
    expect(message.conversationId).toBe(conversationId);
    expect(message.intent).toBe('product_inquiry');
    expect(message.confidence).toBe(0.85);
    expect(message.aiProvider).toBe('minimax');
    expect(message.tokensUsed).toBe(150);
  });

  it('should throw when conversation does not exist for outbound', async () => {
    if (!dbAvailable) return;

    await expect(
      messagesService.storeOutboundMessage({
        conversationId: 'non-existent-conv-id',
        content: 'Test message',
      })
    ).rejects.toThrow();
  });

  it('should return messages in chronological order', async () => {
    if (!dbAvailable) return;

    const history = await messagesService.getMessageHistory(conversationId, { limit: 50 });

    for (let i = 1; i < history.length; i++) {
      expect(history[i].createdAt >= history[i - 1].createdAt).toBe(true);
    }
  });
});