import { createLogger } from '../core/logger.js';
import type { AppConfig } from '../core/config.js';
import { resolveBaseUrl, resolveModel } from '../core/config.js';

const log = createLogger('ai');

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCall[];
  model: string;
  provider: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface CompletionInput {
  system: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(input: CompletionInput): Promise<CompletionResult>;
  embed(texts: string[]): Promise<number[][]>;
}

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60_000);

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI-compatible provider: OpenAI, OpenRouter, Ollama, vLLM, LM Studio, Azure-style proxies. */
export class OpenAiCompatibleProvider implements LLMProvider {
  constructor(
    readonly name: string,
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: input.system },
      ...input.messages.map((m) =>
        m.role === 'tool'
          ? { role: 'tool', content: m.content, tool_call_id: m.toolCallId }
          : { role: m.role, content: m.content },
      ),
    ];
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: input.temperature ?? 0.4,
      max_tokens: input.maxTokens ?? 900,
    };
    if (input.tools?.length) {
      body.tools = input.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
      body.tool_choice = 'auto';
    }
    if (input.json) body.response_format = { type: 'json_object' };

    const data = await postJson(`${this.baseUrl}/chat/completions`, body, {
      authorization: `Bearer ${this.apiKey}`,
    });
    const choice = data.choices?.[0];
    const message = choice?.message ?? {};
    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((call: any) => ({
      id: call.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
      name: call.function?.name,
      arguments: safeParse(call.function?.arguments),
    }));
    return {
      text: message.content ?? '',
      toolCalls,
      model: data.model ?? this.model,
      provider: this.name,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const data = await postJson(
      `${this.baseUrl}/embeddings`,
      { model: process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small', input: texts },
      { authorization: `Bearer ${this.apiKey}` },
    );
    return (data.data ?? []).map((row: any) => row.embedding as number[]);
  }
}

/** Anthropic Messages API. */
export class AnthropicProvider implements LLMProvider {
  constructor(
    readonly name: string,
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const messages = input.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
    const body: Record<string, unknown> = {
      model: this.model,
      system: input.system,
      messages,
      max_tokens: input.maxTokens ?? 900,
      temperature: input.temperature ?? 0.4,
    };
    if (input.tools?.length) {
      body.tools = input.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));
    }
    const data = await postJson(`${this.baseUrl}/messages`, body, {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    });
    const blocks = data.content ?? [];
    const text = blocks
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
    const toolCalls: ToolCall[] = blocks
      .filter((b: any) => b.type === 'tool_use')
      .map((b: any) => ({ id: b.id, name: b.name, arguments: b.input ?? {} }));
    return {
      text,
      toolCalls,
      model: data.model ?? this.model,
      provider: this.name,
      usage: { promptTokens: data.usage?.input_tokens, completionTokens: data.usage?.output_tokens },
    };
  }

  async embed(): Promise<number[][]> {
    throw new Error('Anthropic does not offer embeddings; set EMBEDDINGS_PROVIDER');
  }
}

/** Google Gemini generateContent. */
export class GeminiProvider implements LLMProvider {
  constructor(
    readonly name: string,
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const contents = input.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const body: Record<string, unknown> = {
      contents,
      systemInstruction: { parts: [{ text: input.system }] },
      generationConfig: {
        temperature: input.temperature ?? 0.4,
        maxOutputTokens: input.maxTokens ?? 900,
        ...(input.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (input.tools?.length) {
      body.tools = [
        {
          functionDeclarations: input.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })),
        },
      ];
    }
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const data = await postJson(url, body, {});
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const text = parts
      .filter((p: any) => typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('\n');
    const toolCalls: ToolCall[] = parts
      .filter((p: any) => p.functionCall)
      .map((p: any, index: number) => ({
        id: `gemini_${index}_${Math.random().toString(36).slice(2, 8)}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args ?? {},
      }));
    return {
      text,
      toolCalls,
      model: this.model,
      provider: this.name,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
      },
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const data = await postJson(
      `${this.baseUrl}/models/${process.env.EMBEDDINGS_MODEL || 'text-embedding-004'}:batchEmbedContents?key=${this.apiKey}`,
      {
        requests: texts.map((text) => ({
          model: `models/${process.env.EMBEDDINGS_MODEL || 'text-embedding-004'}`,
          content: { parts: [{ text }] },
        })),
      },
      {},
    );
    return (data.embeddings ?? []).map((row: any) => row.values as number[]);
  }
}

function safeParse(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') return (raw as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Build a provider from config, or null when no key is configured. */
export function createProvider(config: AppConfig): LLMProvider | null {
  const { provider, apiKey } = config.ai;
  const model = resolveModel(config);
  const baseUrl = resolveBaseUrl(config);
  const isLocalOllama = provider === 'ollama';

  if (!apiKey && !isLocalOllama) {
    log.warn(`no AI_API_KEY configured for provider "${provider}" — running on the deterministic brain`);
    return null;
  }

  log.info(`AI provider: ${provider} (${model})`);
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider('anthropic', model, apiKey, baseUrl);
    case 'gemini':
      return new GeminiProvider('gemini', model, apiKey, baseUrl);
    case 'openrouter':
      return new OpenAiCompatibleProvider('openrouter', model, apiKey, baseUrl);
    case 'ollama':
      return new OpenAiCompatibleProvider('ollama', model, apiKey || 'ollama', baseUrl);
    case 'custom':
    case 'openai':
    default:
      return new OpenAiCompatibleProvider(provider, model, apiKey, baseUrl);
  }
}
