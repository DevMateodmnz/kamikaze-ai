/**
 * Unit Tests for AI Gateway
 *
 * Covers: factory, MiniMaxProvider, router delegation.
 * Uses mocked global.fetch — no real network calls.
 * No secrets required; all env vars use placeholder test values from tests/setup.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MiniMaxProvider } from '../../src/modules/ai-gateway/providers/minimax.js';
import { createAiProvider } from '../../src/modules/ai-gateway/factory.js';
import { aiGatewayRouter } from '../../src/modules/ai-gateway/router.js';
import { AppError } from '../../src/utils/app-error.js';
import type {
  GenerateReplyInput,
  ClassifyIntentInput,
  SummarizeConversationInput,
  ExtractLeadDataInput,
} from '../../src/modules/ai-gateway/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function mockFetchNetworkError(): never {
  throw new Error('fetch failed');
}

function chatResponse(content: string, finishReason = 'stop'): unknown {
  return {
    choices: [
      {
        message: { role: 'assistant', content },
        finish_reason: finishReason,
      },
    ],
    usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
  };
}

function classifyResponse(intent: string): unknown {
  return chatResponse(intent);
}

function leadJsonResponse(data: Record<string, unknown>): unknown {
  return chatResponse(JSON.stringify(data));
}

function summaryJsonResponse(data: Record<string, unknown>): unknown {
  return chatResponse(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const generateReplyInput: GenerateReplyInput = {
  userMessage: 'Hola, ¿qué bicicleta me recomendás?',
  conversationId: 'conv-001',
  conversationHistory: [
    { role: 'customer', content: 'Hola' },
    { role: 'assistant', content: '¡Buenas! ¿En qué te ayudo?' },
  ],
};

const classifyIntentInput: ClassifyIntentInput = {
  text: 'Busco una mountain bike para principiante',
};

const summarizeInput: SummarizeConversationInput = {
  conversationId: 'conv-002',
  messages: [
    { role: 'customer', content: 'Hola, quiero ver bicicletas' },
    { role: 'assistant', content: 'Claro, ¿qué tipo buscás?' },
    { role: 'customer', content: 'Algo para ciudad, no muy caro' },
  ],
};

const extractLeadInput: ExtractLeadDataInput = {
  conversationId: 'conv-003',
  messages: [
    { role: 'customer', content: 'Hola, me llamo Ana' },
    { role: 'assistant', content: '¡Hola Ana! ¿Qué buscás?' },
    { role: 'customer', content: 'Una bici para ruta, presupuesto 800 USD' },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AI Gateway', () => {
  // -----------------------------------------------------------------------
  // Factory
  // -----------------------------------------------------------------------
  describe('createAiProvider (factory)', () => {
    it('returns MiniMaxProvider for "minimax"', () => {
      const provider = createAiProvider('minimax');
      expect(provider.name).toBe('minimax');
      expect(provider.capabilities).toBeDefined();
      expect(provider.capabilities.maxTokens).toBeGreaterThan(0);
    });

    it('throws for unimplemented providers', () => {
      expect(() => createAiProvider('openai')).toThrow(/not implemented/);
      expect(() => createAiProvider('gemini')).toThrow(/not implemented/);
      expect(() => createAiProvider('anthropic')).toThrow(/not implemented/);
      expect(() => createAiProvider('local')).toThrow(/not implemented/);
    });

    it('lists available providers in error message', () => {
      expect(() => createAiProvider('openai')).toThrow(/minimax/);
    });
  });

  // -----------------------------------------------------------------------
  // MiniMaxProvider — Configuration
  // -----------------------------------------------------------------------
  describe('MiniMaxProvider — configuration', () => {
    it('throws when MINIMAX_API_KEY is missing', async () => {
      vi.stubEnv('MINIMAX_API_KEY', '');
      const provider = new MiniMaxProvider();
      await expect(
        provider.generateReply({
          userMessage: 'Hola',
          conversationId: 'conv-001',
        })
      ).rejects.toThrow(AppError);
      await expect(
        provider.generateReply({
          userMessage: 'Hola',
          conversationId: 'conv-001',
        })
      ).rejects.toMatchObject({ code: 'AI_PROVIDER_CONFIG_ERROR' });
      vi.unstubAllEnvs();
    });

    it('throws when MINIMAX_MODEL is missing', async () => {
      vi.stubEnv('MINIMAX_MODEL', '');
      const provider = new MiniMaxProvider();
      await expect(
        provider.generateReply({
          userMessage: 'Hola',
          conversationId: 'conv-001',
        })
      ).rejects.toThrow(AppError);
      await expect(
        provider.generateReply({
          userMessage: 'Hola',
          conversationId: 'conv-001',
        })
      ).rejects.toMatchObject({ code: 'AI_PROVIDER_CONFIG_ERROR' });
      vi.unstubAllEnvs();
    });
  });

  // -----------------------------------------------------------------------
  // MiniMaxProvider — generateReply
  // -----------------------------------------------------------------------
  describe('MiniMaxProvider — generateReply', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('sends correct request to MiniMax API', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(chatResponse('Te recomiendo la MTB X100'))
      );

      const provider = new MiniMaxProvider();
      await provider.generateReply(generateReplyInput);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://test-api.example.com/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-minimax-key',
      });

      const body = JSON.parse(options.body as string);
      expect(body.model).toBe('MiniMax-Text-01');
      expect(body.messages).toHaveLength(4); // system + 2 history + user
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[3].role).toBe('user');
      expect(body.messages[3].content).toBe(generateReplyInput.userMessage);
    });

    it('returns normalized GenerateReplyOutput on success', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(chatResponse('Te recomiendo la MTB X100', 'stop'))
      );

      const provider = new MiniMaxProvider();
      const output = await provider.generateReply(generateReplyInput);

      expect(output.text).toBe('Te recomiendo la MTB X100');
      expect(output.confidence).toBe(0.8);
      expect(output.finishReason).toBe('stop');
      expect(output.provider).toBe('minimax');
      expect(output.needsHuman).toBe(false);
      expect(output.tokensUsed).toEqual({ input: 50, output: 30 });
      expect(output.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('maps finish_reason correctly', async () => {
      const cases: Array<[string, string]> = [
        ['stop', 'stop'],
        ['length', 'length'],
        ['content_filter', 'content_filter'],
        ['unknown_reason', 'error'],
      ];

      for (const [apiReason, expected] of cases) {
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse(chatResponse('OK', apiReason))
        );
        const provider = new MiniMaxProvider();
        const output = await provider.generateReply({
          userMessage: 'Hola',
          conversationId: 'c1',
        });
        expect(output.finishReason).toBe(expected);
      }
    });
  });

  // -----------------------------------------------------------------------
  // MiniMaxProvider — classifyIntent
  // -----------------------------------------------------------------------
  describe('MiniMaxProvider — classifyIntent', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns classified intent on success', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(classifyResponse('product_interest'))
      );

      const provider = new MiniMaxProvider();
      const output = await provider.classifyIntent(classifyIntentInput);

      expect(output.intent).toBe('product_interest');
      expect(output.confidence).toBeGreaterThan(0);
    });

    it('falls back to "general" for unrecognized intent', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(classifyResponse('some_unknown_intent'))
      );

      const provider = new MiniMaxProvider();
      const output = await provider.classifyIntent({ text: 'Blah' });

      expect(output.intent).toBe('general');
      expect(output.confidence).toBeLessThanOrEqual(0.5);
    });

    it('handles all valid intents', async () => {
      const validIntents = [
        'greeting', 'product_interest', 'stock_question', 'discount_request',
        'warranty', 'complaint', 'human_request', 'technical_question',
        'appointment_request', 'general',
      ];

      for (const intent of validIntents) {
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse(classifyResponse(intent))
        );
        const provider = new MiniMaxProvider();
        const output = await provider.classifyIntent({ text: 'test' });
        expect(output.intent).toBe(intent);
      }
    });
  });

  // -----------------------------------------------------------------------
  // MiniMaxProvider — summarize
  // -----------------------------------------------------------------------
  describe('MiniMaxProvider — summarize', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns parsed summary on success', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(
          summaryJsonResponse({
            summary: 'Cliente busca bici urbana económica.',
            keyTopics: ['bicicleta', 'ciudad', 'presupuesto'],
            customerSentiment: 'positive',
            escalationReasons: [],
            suggestedReply: 'Te recomiendo el modelo Urban 200.',
          })
        )
      );

      const provider = new MiniMaxProvider();
      const output = await provider.summarize(summarizeInput);

      expect(output.summary.summary).toBe('Cliente busca bici urbana económica.');
      expect(output.summary.keyTopics).toEqual(['bicicleta', 'ciudad', 'presupuesto']);
      expect(output.summary.customerSentiment).toBe('positive');
      expect(output.summary.escalationReasons).toEqual([]);
      expect(output.summary.suggestedReply).toBe('Te recomiendo el modelo Urban 200.');
      expect(output.tokensUsed).toEqual({ input: 50, output: 30 });
    });

    it('handles unparseable JSON response gracefully', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(chatResponse('Not valid JSON at all'))
      );

      const provider = new MiniMaxProvider();
      const output = await provider.summarize(summarizeInput);

      // Should not throw; uses raw text as summary fallback
      expect(output.summary.summary).toBe('Not valid JSON at all');
      expect(output.summary.keyTopics).toEqual([]);
      expect(output.summary.customerSentiment).toBe('uncertain');
    });

    it('validates sentiment to allowed values', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(
          summaryJsonResponse({
            summary: 'Test',
            keyTopics: [],
            customerSentiment: 'invalid_sentiment',
            escalationReasons: [],
          })
        )
      );

      const provider = new MiniMaxProvider();
      const output = await provider.summarize(summarizeInput);

      expect(output.summary.customerSentiment).toBe('uncertain');
    });
  });

  // -----------------------------------------------------------------------
  // MiniMaxProvider — extractLeadData
  // -----------------------------------------------------------------------
  describe('MiniMaxProvider — extractLeadData', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns parsed lead data on success', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(
          leadJsonResponse({
            name: 'Ana',
            phone: null,
            interestedIn: ['bicicleta de ruta'],
            budget: '800 USD',
            timeline: 'this_week',
            preferredContactMethod: 'whatsapp',
            notes: null,
            qualified: true,
            qualificationReasons: ['Presupuesto claro', 'Intención definida'],
          })
        )
      );

      const provider = new MiniMaxProvider();
      const output = await provider.extractLeadData(extractLeadInput);

      expect(output.lead.name).toBe('Ana');
      expect(output.lead.phone).toBeUndefined();
      expect(output.lead.interestedIn).toEqual(['bicicleta de ruta']);
      expect(output.lead.budget).toBe('800 USD');
      expect(output.lead.timeline).toBe('this_week');
      expect(output.lead.preferredContactMethod).toBe('whatsapp');
      expect(output.lead.qualified).toBe(true);
      expect(output.lead.qualificationReasons).toEqual([
        'Presupuesto claro',
        'Intención definida',
      ]);
      expect(output.tokensUsed).toEqual({ input: 50, output: 30 });
    });

    it('handles unparseable JSON response gracefully', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(chatResponse('Not JSON'))
      );

      const provider = new MiniMaxProvider();
      const output = await provider.extractLeadData(extractLeadInput);

      // Should not throw; defaults to empty lead
      expect(output.lead.name).toBeUndefined();
      expect(output.lead.qualified).toBe(false);
      expect(output.lead.qualificationReasons).toEqual([]);
    });

    it('validates timeline to allowed values', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(
          leadJsonResponse({
            name: 'X',
            interestedIn: [],
            qualified: false,
            qualificationReasons: [],
            timeline: 'next_year',
          })
        )
      );

      const provider = new MiniMaxProvider();
      const output = await provider.extractLeadData(extractLeadInput);

      expect(output.lead.timeline).toBeUndefined(); // invalid → undefined
    });
  });

  // -----------------------------------------------------------------------
  // MiniMaxProvider — Error handling
  // -----------------------------------------------------------------------
  describe('MiniMaxProvider — error handling', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('throws AppError on HTTP 4xx/5xx', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse({ error: 'Unauthorized' }, 401));

      const provider = new MiniMaxProvider();
      const promise = provider.generateReply({
        userMessage: 'Hola',
        conversationId: 'conv-001',
      });

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        code: 'AI_PROVIDER_ERROR',
        statusCode: 502,
      });
    });

    it('throws AppError on network failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('fetch failed'));

      const provider = new MiniMaxProvider();
      const promise = provider.generateReply({
        userMessage: 'Hola',
        conversationId: 'conv-001',
      });

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
    });

    it('throws AppError on timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValueOnce(abortError);

      const provider = new MiniMaxProvider();
      const promise = provider.generateReply({
        userMessage: 'Hola',
        conversationId: 'conv-001',
      });

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        code: 'AI_PROVIDER_TIMEOUT',
        statusCode: 504,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Router — Delegation
  // -----------------------------------------------------------------------
  describe('aiGatewayRouter — delegation', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('delegates generateReply to configured provider', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(chatResponse('Respuesta del router'))
      );

      const output = await aiGatewayRouter.generateReply(generateReplyInput);

      expect(output.text).toBe('Respuesta del router');
      expect(output.provider).toBe('minimax');
    });

    it('delegates classifyIntent to configured provider', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(classifyResponse('greeting'))
      );

      const output = await aiGatewayRouter.classifyIntent({
        text: 'Hola buenos días',
      });

      expect(output.intent).toBe('greeting');
    });

    it('delegates summarize to configured provider', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(
          summaryJsonResponse({
            summary: 'Resumen del router.',
            keyTopics: ['tema1'],
            customerSentiment: 'neutral',
            escalationReasons: [],
          })
        )
      );

      const output = await aiGatewayRouter.summarize(summarizeInput);

      expect(output.summary.summary).toBe('Resumen del router.');
    });

    it('delegates extractLeadData to configured provider', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(
          leadJsonResponse({
            name: 'Router Lead',
            interestedIn: [],
            qualified: false,
            qualificationReasons: [],
          })
        )
      );

      const output = await aiGatewayRouter.extractLeadData(extractLeadInput);

      expect(output.lead.name).toBe('Router Lead');
    });

    it('returns error from provider through router', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse({}, 500));

      await expect(
        aiGatewayRouter.generateReply(generateReplyInput)
      ).rejects.toThrow(AppError);
    });
  });
});
