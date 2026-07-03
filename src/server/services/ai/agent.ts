/**
 * Tool-calling agent loop.
 * Streams the model's answer while letting it call graph tools to ground its
 * reasoning. Tool rounds run to completion; content is streamed to the caller
 * as it arrives. The system prompt is grounded with an optional node context.
 */

import { AiConfig } from './config';
import { toolDefinitions, dispatchTool } from './tools';
import { streamCompletion, ChatMessage } from './client';
import { graphStore } from '../../graph/store';
import { AiMessage } from '../../../shared/types';

const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = [
  'You are an assistant embedded in Visual Gherkin, a tool that models a BDD test',
  'suite as a typed graph. Answer questions about the suite by calling the provided',
  'tools to fetch exact facts (impact, health, duplicates, scenarios, step queries)',
  'rather than guessing. When proposing edits, describe them precisely and cite the',
  'affected scenarios and files; never claim a change was applied — the user applies',
  'changes through the refactor tools. Prefer concrete, suite-specific answers.',
].join(' ');

/** Build a grounding message describing the selected node, if any. */
function nodeContext(nodeId: string): string | null {
  const node = graphStore.getNode(nodeId);
  if (!node) return null;
  const impact = node.kind === 'tag' || node.kind === 'stepdef' ? null : graphStore.impact(nodeId);
  const summary: Record<string, unknown> = {
    id: node.id,
    kind: node.kind,
    label: node.label,
    file: node.file,
  };
  if (impact) {
    summary.impact = {
      scenarioCount: impact.scenarioCount,
      featureCount: impact.featureCount,
      fileCount: impact.fileCount,
      stepDefCount: impact.stepDefs.length,
    };
  }
  return `The user has selected this graph node:\n${JSON.stringify(summary)}`;
}

interface RunHandlers {
  onContent: (delta: string) => void;
  onToolCall: (name: string, args: Record<string, any>) => void;
}

/** Run the grounded, tool-calling completion, streaming content via handlers. */
export async function runAgent(
  config: AiConfig,
  history: AiMessage[],
  nodeId: string | undefined,
  handlers: RunHandlers
): Promise<void> {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];

  if (nodeId) {
    const context = nodeContext(nodeId);
    if (context) {
      messages.push({ role: 'system', content: context });
    }
  }

  for (const message of history) {
    messages.push({ role: message.role, content: message.content });
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await streamCompletion(config, messages, toolDefinitions, handlers);

    if (result.finishReason !== 'tool_calls' || result.toolCalls.length === 0) {
      return;
    }

    messages.push({ role: 'assistant', content: null, tool_calls: result.toolCalls });

    for (const call of result.toolCalls) {
      let content: string;
      try {
        const args = parseArgs(call.function.arguments);
        handlers.onToolCall(call.function.name, args);
        content = JSON.stringify(dispatchTool(call.function.name, args));
      } catch (error) {
        content = JSON.stringify({ error: error instanceof Error ? error.message : 'tool failed' });
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }

  throw new Error(`Exceeded ${MAX_TOOL_ROUNDS} tool rounds without a final answer`);
}

function parseArgs(raw: string): Record<string, any> {
  if (!raw) return {};
  return JSON.parse(raw);
}
