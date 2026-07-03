/**
 * OpenAI-compatible streaming chat client.
 * Works against any endpoint that implements POST /chat/completions with the
 * OpenAI schema (Ollama, LM Studio, vLLM, OpenAI, ...). Streams content deltas
 * and accumulates streamed tool-call fragments into complete calls.
 */

import { AiConfig } from './config';
import { ToolDefinition } from './tools';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: AccumulatedToolCall[];
  tool_call_id?: string;
}

export interface AccumulatedToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface StreamResult {
  finishReason: string;
  toolCalls: AccumulatedToolCall[];
}

interface StreamHandlers {
  onContent: (delta: string) => void;
}

function parseSseData(buffer: string): string[] {
  const events: string[] = [];
  for (const line of buffer.split('\n')) {
    const trimmed = line.trimEnd();
    if (trimmed.startsWith('data:')) {
      events.push(trimmed.slice(5).trim());
    }
  }
  return events;
}

/**
 * Perform one streaming completion. Content deltas are forwarded to
 * handlers.onContent; tool-call deltas are accumulated and returned.
 */
export async function streamCompletion(
  config: AiConfig,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  handlers: StreamHandlers
): Promise<StreamResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Model request failed (${response.status}): ${detail || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls: AccumulatedToolCall[] = [];
  let finishReason = 'stop';
  let pending = '';

  const consume = (data: string) => {
    if (data === '[DONE]') return;
    const chunk = JSON.parse(data);
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta ?? {};

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      handlers.onContent(delta.content);
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const index = tc.index ?? 0;
        if (!toolCalls[index]) {
          toolCalls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
        }
        const acc = toolCalls[index];
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.function.name = tc.function.name;
        if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
      }
    }

    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }
  };

  // Read the SSE stream, splitting on blank-line event boundaries.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let boundary = pending.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      for (const data of parseSseData(rawEvent)) {
        consume(data);
      }
      boundary = pending.indexOf('\n\n');
    }
  }
  for (const data of parseSseData(pending)) {
    consume(data);
  }

  return { finishReason, toolCalls: toolCalls.filter(Boolean) };
}
