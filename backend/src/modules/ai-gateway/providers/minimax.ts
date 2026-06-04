/**
 * MiniMax Provider Adapter
 *
 * Translates generic AiProvider calls into MiniMax-compatible API requests
 * and normalizes responses back to the AiProvider output types.
 *
 * MiniMax uses an OpenAI-compatible chat completions API.
 * This adapter uses native fetch (Node 18+) — no SDK dependency needed.
 *
 * Provider selection: controlled via AI_PROVIDER=minimax env var + factory.
 * Prompt behavior: minimal, generic task descriptions only.
 *   Company-specific personality/logic belongs in a higher layer (future PR).
 */

import type {
  AiProvider,
  AiProviderName,
  AiCapabilities,
  GenerateReplyInput,
  GenerateReplyOutput,
  ClassifyIntentInput,
  ClassifyIntentOutput,
  SummarizeConversationInput,
  SummarizeConversationOutput,
  ExtractLeadDataInput,
  ExtractLeadDataOutput,
  Intent,
  LeadData,
} from '../types.js';
import { AppError } from '../../../utils/app-error.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://api.minimaxi.chat/v1';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS_REPLY = 400;
const DEFAULT_MAX_TOKENS_INTENT = 100;
const DEFAULT_TEMPERATURE = 0.3;

const VALID_INTENTS: ReadonlySet<string> = new Set<Intent>([
  'greeting',
  'product_interest',
  'stock_question',
  'discount_request',
  'warranty',
  'complaint',
  'human_request',
  'technical_question',
  'appointment_request',
  'general',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class MiniMaxProvider implements AiProvider {
  readonly name: AiProviderName = 'minimax';
  readonly capabilities: AiCapabilities = {
    maxTokens: 200_000,
    supportsStreaming: true,
    supportsVision: false,
    costPerToken: { input: 0.000002, output: 0.000008 },
  };

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    this.apiKey = process.env['MINIMAX_API_KEY'] ?? '';
    this.model = process.env['MINIMAX_MODEL'] ?? '';
    this.baseUrl = process.env['MINIMAX_API_BASE_URL'] ?? DEFAULT_BASE_URL;
    this.timeoutMs = parseInt(
      process.env['AI_TIMEOUT_MS'] ?? String(DEFAULT_TIMEOUT_MS),
      10
    );
  }

  // -----------------------------------------------------------------------
  // AiProvider implementation
  // -----------------------------------------------------------------------

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyOutput> {
    const start = Date.now();

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant. Reply concisely and directly.' },
    ];

    for (const msg of input.conversationHistory ?? []) {
      const role = msg.role === 'customer' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system';
      messages.push({ role, content: msg.content });
    }

    messages.push({ role: 'user', content: input.userMessage });

    const maxTokens = parseInt(
      process.env['AI_MAX_TOKENS_REPLY'] ?? String(DEFAULT_MAX_TOKENS_REPLY),
      10
    );

    const result = await this.chatCompletion(messages, maxTokens);
    const latencyMs = Date.now() - start;

    return {
      text: result.content,
      confidence: 0.8,
      finishReason: this.mapFinishReason(result.finishReason),
      needsHuman: false,
      provider: 'minimax',
      tokensUsed: result.usage,
      latencyMs,
    };
  }

  async classifyIntent(input: ClassifyIntentInput): Promise<ClassifyIntentOutput> {
    const start = Date.now();

    const intentsList = Array.from(VALID_INTENTS).join(', ');
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          `Classify the user message into exactly one intent from this list: ${intentsList}. ` +
          'Respond with only the intent name, nothing else.',
      },
      { role: 'user', content: input.text },
    ];

    const maxTokens = parseInt(
      process.env['AI_MAX_TOKENS_INTENT'] ?? String(DEFAULT_MAX_TOKENS_INTENT),
      10
    );

    const result = await this.chatCompletion(messages, maxTokens);
    const rawIntent = result.content.trim().toLowerCase();
    const isMatch = VALID_INTENTS.has(rawIntent);
    const intent: Intent = isMatch ? (rawIntent as Intent) : 'general';

    return {
      intent,
      confidence: isMatch ? 0.85 : 0.5,
    };
  }

  async summarize(input: SummarizeConversationInput): Promise<SummarizeConversationOutput> {
    const start = Date.now();

    const conversationText = input.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const maxLengthHint = input.maxLength ? ` in at most ${input.maxLength} words` : '';
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          `Summarize the following conversation${maxLengthHint}. ` +
          'Return a JSON object with keys: summary (string), keyTopics (string array), ' +
          'customerSentiment (one of: positive, neutral, negative, uncertain), ' +
          'escalationReasons (string array), suggestedReply (string or null).',
      },
      { role: 'user', content: conversationText },
    ];

    const result = await this.chatCompletion(messages);
    const parsed = this.parseJsonSafe(result.content);

    return {
      summary: {
        summary: typeof parsed.summary === 'string' ? parsed.summary : result.content,
        keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
        customerSentiment: this.validateSentiment(parsed.customerSentiment),
        escalationReasons: Array.isArray(parsed.escalationReasons) ? parsed.escalationReasons : [],
        suggestedReply: typeof parsed.suggestedReply === 'string' ? parsed.suggestedReply : undefined,
      },
      tokensUsed: result.usage,
      latencyMs: Date.now() - start,
    };
  }

  async extractLeadData(input: ExtractLeadDataInput): Promise<ExtractLeadDataOutput> {
    const start = Date.now();

    const conversationText = input.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'Extract lead information from the conversation. Return ONLY a JSON object with keys: ' +
          'name (string or null), phone (string or null), interestedIn (string array), ' +
          'budget (string or null), timeline (one of: immediate, this_week, this_month, exploring or null), ' +
          'preferredContactMethod (one of: whatsapp, phone, in_person or null), ' +
          'notes (string or null), qualified (boolean), qualificationReasons (string array).',
      },
      { role: 'user', content: conversationText },
    ];

    const result = await this.chatCompletion(messages);
    const parsed = this.parseJsonSafe(result.content);

    const lead: LeadData = {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
      interestedIn: Array.isArray(parsed.interestedIn) ? parsed.interestedIn : [],
      budget: typeof parsed.budget === 'string' ? parsed.budget : undefined,
      timeline: this.validateTimeline(parsed.timeline),
      preferredContactMethod: this.validateContactMethod(parsed.preferredContactMethod),
      notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
      qualified: Boolean(parsed.qualified),
      qualificationReasons: Array.isArray(parsed.qualificationReasons)
        ? parsed.qualificationReasons
        : [],
    };

    return {
      lead,
      tokensUsed: result.usage,
      latencyMs: Date.now() - start,
    };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Send a chat completion request to MiniMax.
   * Validates config, applies timeout, handles HTTP and network errors.
   */
  private async chatCompletion(
    messages: ChatMessage[],
    maxTokens?: number
  ): Promise<{ content: string; finishReason: string; usage?: { input: number; output: number } }> {
    this.validateConfig();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS_REPLY,
          temperature: DEFAULT_TEMPERATURE,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new AppError(
          `MiniMax API responded with ${response.status}: ${response.statusText}`,
          { statusCode: 502, code: 'AI_PROVIDER_ERROR' }
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;

      return {
        content: data.choices?.[0]?.message?.content ?? '',
        finishReason: data.choices?.[0]?.finish_reason ?? 'stop',
        usage: data.usage
          ? { input: data.usage.prompt_tokens ?? 0, output: data.usage.completion_tokens ?? 0 }
          : undefined,
      };
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;

      // AbortError: name check is more portable than instanceof DOMException
      // (DOMException may not extend Error in all Node environments).
      const maybeError = error as Record<string, unknown> | null | undefined;
      if (maybeError != null && maybeError['name'] === 'AbortError') {
        throw new AppError('AI provider request timed out', {
          statusCode: 504,
          code: 'AI_PROVIDER_TIMEOUT',
        });
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(`AI provider request failed: ${message}`, {
        statusCode: 502,
        code: 'AI_PROVIDER_ERROR',
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private validateConfig(): void {
    if (!this.apiKey) {
      throw new AppError(
        'MINIMAX_API_KEY environment variable is required for MiniMax provider',
        { statusCode: 500, code: 'AI_PROVIDER_CONFIG_ERROR' }
      );
    }
    if (!this.model) {
      throw new AppError(
        'MINIMAX_MODEL environment variable is required for MiniMax provider',
        { statusCode: 500, code: 'AI_PROVIDER_CONFIG_ERROR' }
      );
    }
  }

  private mapFinishReason(reason: string): GenerateReplyOutput['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'error';
    }
  }

  private parseJsonSafe(text: string): Record<string, unknown> {
    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/gi, '').trim();
      const parsed = JSON.parse(cleaned);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private validateSentiment(
    value: unknown
  ): 'positive' | 'neutral' | 'negative' | 'uncertain' {
    const valid = new Set(['positive', 'neutral', 'negative', 'uncertain']);
    return typeof value === 'string' && valid.has(value)
      ? (value as 'positive' | 'neutral' | 'negative' | 'uncertain')
      : 'uncertain';
  }

  private validateTimeline(
    value: unknown
  ): 'immediate' | 'this_week' | 'this_month' | 'exploring' | undefined {
    const valid = new Set(['immediate', 'this_week', 'this_month', 'exploring']);
    return typeof value === 'string' && valid.has(value)
      ? (value as 'immediate' | 'this_week' | 'this_month' | 'exploring')
      : undefined;
  }

  private validateContactMethod(
    value: unknown
  ): 'whatsapp' | 'phone' | 'in_person' | undefined {
    const valid = new Set(['whatsapp', 'phone', 'in_person']);
    return typeof value === 'string' && valid.has(value)
      ? (value as 'whatsapp' | 'phone' | 'in_person')
      : undefined;
  }
}
