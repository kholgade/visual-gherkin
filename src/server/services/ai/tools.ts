/**
 * Graph tools exposed to the model.
 * Each tool is a deterministic query against the typed graph store or the
 * loaded session, so the model reasons over exact facts instead of guessing.
 */

import { graphStore } from '../../graph/store';
import { session } from '../session';
import { QueryRequest } from '../../../shared/types';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_impact',
      description:
        'Return the exact blast radius of a graph node: every scenario, feature, file and step definition affected if it changes. Use before proposing any edit.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Graph node id, e.g. "step::Action::i log in".' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_steps',
      description: 'Search step nodes by text, minimum usage, keyword type, or unmatched-glue status.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          minUsage: { type: 'integer' },
          keywordType: { type: 'string', enum: ['Context', 'Action', 'Outcome'] },
          unmatchedOnly: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_health',
      description:
        'Return the suite health report: unmatched steps, unused step definitions, empty features, step-less scenarios, contradictions, duplicate clusters, and reuse metrics.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_duplicates',
      description: 'Return near-duplicate step clusters grouped by parameterized template.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_scenario',
      description: 'Return a scenario with its ordered steps, tags, keyword types and glue-match status.',
      parameters: {
        type: 'object',
        properties: {
          scenarioId: { type: 'string', description: 'Scenario node id, e.g. "scenario::/path/f.feature::12".' },
        },
        required: ['scenarioId'],
      },
    },
  },
];

function getScenario(scenarioId: string): unknown {
  const node = graphStore.getNode(scenarioId);
  if (!node || node.kind !== 'scenario') {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }
  const feature = session.getFeatures().find((f) => f.file === node.file);
  if (!feature) {
    throw new Error(`Feature not loaded for scenario: ${scenarioId}`);
  }
  const scenario = feature.scenarios.find((s) => s.line === node.line);
  if (!scenario) {
    throw new Error(`Scenario line not found: ${scenarioId}`);
  }
  return {
    id: scenarioId,
    name: scenario.name,
    file: feature.file,
    feature: feature.feature,
    tags: scenario.tags,
    rule: scenario.rule,
    background: feature.background.map((s) => ({ keyword: s.type, text: s.text })),
    steps: scenario.steps.map((s) => ({
      keyword: s.type,
      keywordType: s.keywordType,
      text: s.text,
    })),
  };
}

/** Execute a tool call by name and return a JSON-serializable result. */
export function dispatchTool(name: string, args: Record<string, any>): unknown {
  switch (name) {
    case 'get_impact': {
      const result = graphStore.impact(args.nodeId);
      if (!result) throw new Error(`Node not found: ${args.nodeId}`);
      return result;
    }
    case 'query_steps':
      return graphStore.query(args as QueryRequest);
    case 'get_health':
      return graphStore.health();
    case 'get_duplicates':
      return graphStore.duplicateClusters();
    case 'get_scenario':
      return getScenario(args.scenarioId);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
