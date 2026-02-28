/**
 * Analysis engine
 * Builds a hierarchical flow graph: feature → scenario/background → step
 * Identical steps across scenarios share a single node — multiple edges point to it
 */

import dagre from 'dagre';
import {
  ParsedFeature,
  ActionStep,
  FlowNode,
  FlowEdge,
  SubtreeEntry,
  VisualizationGraph,
} from '../../../shared/types';

/** Node dimensions used by Dagre for layout calculations */
const NODE_WIDTH: Record<string, number> = {
  feature: 180,
  scenario: 160,
  background: 120,
  step: 260,
};
const NODE_HEIGHT = 36;

/**
 * Apply Dagre layout to nodes in-place.
 * Uses LR (left-to-right) direction for wide graphs.
 */
function applyDagreLayout(nodes: FlowNode[], edges: FlowEdge[]): void {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 16, ranksep: 60, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const w = NODE_WIDTH[node.type] ?? 220;
    g.setNode(node.id, { width: w, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      node.position = { x: pos.x - (NODE_WIDTH[node.type] ?? 220) / 2, y: pos.y - NODE_HEIGHT / 2 };
    }
  }
}

/**
 * Generate a visually distinct color for a scenario given its index and total count.
 * Distributes hues evenly across 360°, with fixed saturation and lightness for readability.
 */
function scenarioColor(index: number, total: number): string {
  const hue = Math.round((index / Math.max(total, 1)) * 360);
  return `hsl(${hue}, 70%, 45%)`;
}

/** Normalize step for deduplication key */
function stepKey(keyword: string, text: string): string {
  return `${keyword}:${text.toLowerCase().trim()}`;
}

/** Extract common actions (steps shared across multiple scenarios) */
function extractCommonActions(features: ParsedFeature[]): ActionStep[] {
  const actionMap = new Map<string, ActionStep>();
  for (const feature of features) {
    for (const scenario of feature.scenarios) {
      for (const step of scenario.steps) {
        const key = stepKey(step.type, step.text);
        if (!actionMap.has(key)) {
          actionMap.set(key, { text: step.text, occurrences: [] });
        }
        actionMap.get(key)!.occurrences.push({ scenario: scenario.name, file: feature.file });
      }
    }
  }
  return Array.from(actionMap.values()).filter((a) => a.occurrences.length > 1);
}

/**
 * Build complete visualization graph.
 * Shared steps (same keyword+text) are represented as ONE node with multiple incoming edges.
 * Background is positioned to the left of its feature, clearly separated from scenarios.
 */
export function buildVisualizationGraph(
  features: ParsedFeature[],
  fileHashes: Record<string, string>
): VisualizationGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  let nodeCounter = 0;
  let edgeCounter = 0;
  const nextNodeId = () => `n-${nodeCounter++}`;
  const nextEdgeId = () => `e-${edgeCounter++}`;

  /** subtreeMap: nodeId → { nodeIds, edgeIds } built inline during construction */
  const subtreeMap: Record<string, SubtreeEntry> = {};

  const addEdge = (source: string, target: string, color?: string): string => {
    const id = nextEdgeId();
    edges.push({ id, source, target, edgeKind: 'structural', data: { color } });
    return id;
  };

  // Global shared step registry: stepKey → node ID
  const sharedStepRegistry = new Map<string, string>();

  const totalScenarios = features.reduce((sum, f) => sum + f.scenarios.length, 0);
  let scenarioColorIndex = 0;

  for (const feature of features) {
    // --- Feature node ---
    const featureNodeId = nextNodeId();
    nodes.push({
      id: featureNodeId,
      type: 'feature',
      data: { label: feature.feature, file: feature.file },
      position: { x: 0, y: 0 },
    });

    // Subtree entry for the feature — accumulates all child node/edge IDs
    const featureEntry: SubtreeEntry = { nodeIds: [featureNodeId], edgeIds: [] };

    // --- Background node (neutral gray) ---
    let backgroundNodeIds: string[] = [];
    let backgroundEdgeIds: string[] = [];
    if (feature.background.length > 0) {
      const bgNodeId = nextNodeId();
      nodes.push({
        id: bgNodeId,
        type: 'background',
        data: { label: 'Background', steps: feature.background },
        position: { x: 0, y: 0 },
      });
      const bgEdgeId = addEdge(featureNodeId, bgNodeId);
      backgroundNodeIds = [bgNodeId];
      backgroundEdgeIds = [bgEdgeId];

      let prevBgNodeId = bgNodeId;
      feature.background.forEach((step) => {
        const key = stepKey(step.type, step.text);
        let stepNodeId = sharedStepRegistry.get(key);
        if (!stepNodeId) {
          stepNodeId = nextNodeId();
          sharedStepRegistry.set(key, stepNodeId);
          nodes.push({
            id: stepNodeId,
            type: 'step',
            data: { keyword: step.type, text: step.text },
            position: { x: 0, y: 0 },
          });
        }
        const eid = addEdge(prevBgNodeId, stepNodeId);
        backgroundNodeIds.push(stepNodeId);
        backgroundEdgeIds.push(eid);
        prevBgNodeId = stepNodeId;
      });

      featureEntry.nodeIds.push(...backgroundNodeIds);
      featureEntry.edgeIds.push(...backgroundEdgeIds);
    }

    // --- Scenario nodes — each gets a unique color ---
    feature.scenarios.forEach((scenario) => {
      const color = scenarioColor(scenarioColorIndex++, totalScenarios);

      const scenarioNodeId = nextNodeId();
      nodes.push({
        id: scenarioNodeId,
        type: 'scenario',
        data: { label: scenario.name, tags: scenario.tags ?? [], color },
        position: { x: 0, y: 0 },
      });
      const scenToFeatureEdgeId = addEdge(featureNodeId, scenarioNodeId, color);

      // Scenario subtree includes background + its own steps
      const scenEntry: SubtreeEntry = {
        nodeIds: [...backgroundNodeIds, scenarioNodeId],
        edgeIds: [...backgroundEdgeIds, scenToFeatureEdgeId],
      };

      let prevNodeId = scenarioNodeId;
      scenario.steps.forEach((step) => {
        const key = stepKey(step.type, step.text);
        let stepNodeId = sharedStepRegistry.get(key);
        if (!stepNodeId) {
          stepNodeId = nextNodeId();
          sharedStepRegistry.set(key, stepNodeId);
          nodes.push({
            id: stepNodeId,
            type: 'step',
            data: { keyword: step.type, text: step.text },
            position: { x: 0, y: 0 },
          });
        }
        const eid = addEdge(prevNodeId, stepNodeId, color);
        scenEntry.nodeIds.push(stepNodeId);
        scenEntry.edgeIds.push(eid);
        prevNodeId = stepNodeId;
      });

      subtreeMap[scenarioNodeId] = scenEntry;

      // Accumulate into feature entry
      featureEntry.nodeIds.push(...scenEntry.nodeIds.filter(id => !featureEntry.nodeIds.includes(id)));
      featureEntry.edgeIds.push(...scenEntry.edgeIds.filter(id => !featureEntry.edgeIds.includes(id)));
    });

    subtreeMap[featureNodeId] = featureEntry;
  }

  // Apply Dagre auto-layout
  applyDagreLayout(nodes, edges);

  const commonActions = extractCommonActions(features);
  const scenarioCount = features.reduce((sum, f) => sum + f.scenarios.length, 0);

  return {
    nodes,
    edges,
    commonActions,
    subtreeMap,
    metadata: {
      parsedAt: Date.now(),
      fileCount: features.length,
      scenarioCount,
      fileHashes,
    },
  };
}
