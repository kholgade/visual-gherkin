/**
 * Analysis engine
 * Builds a hierarchical flow graph: feature → scenario/background → step
 * Identical steps across scenarios share a single node — multiple edges point to it
 */

import {
  ParsedFeature,
  ActionStep,
  FlowNode,
  FlowEdge,
  VisualizationGraph,
} from '../../../shared/types';

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

  const addEdge = (source: string, target: string): void => {
    edges.push({ id: nextEdgeId(), source, target, edgeKind: 'structural', data: {} });
  };

  // Global shared step registry: stepKey → node ID
  // A step node is created once; subsequent scenarios just get an edge to it
  const sharedStepRegistry = new Map<string, string>();

  for (let fileIndex = 0; fileIndex < features.length; fileIndex++) {
    const feature = features[fileIndex];
    const featureX = fileIndex * 1400;

    // --- Feature node ---
    const featureNodeId = nextNodeId();
    nodes.push({
      id: featureNodeId,
      type: 'feature',
      data: { label: feature.feature, file: feature.file },
      position: { x: featureX, y: 0 },
    });

    // --- Background node (left of feature, clearly separated) ---
    if (feature.background.length > 0) {
      const bgNodeId = nextNodeId();
      nodes.push({
        id: bgNodeId,
        type: 'background',
        data: { label: 'Background', steps: feature.background },
        position: { x: featureX - 500, y: 160 },
      });
      addEdge(featureNodeId, bgNodeId);

      let prevBgNodeId = bgNodeId;
      feature.background.forEach((step, i) => {
        const key = stepKey(step.type, step.text);
        let stepNodeId = sharedStepRegistry.get(key);
        if (!stepNodeId) {
          stepNodeId = nextNodeId();
          sharedStepRegistry.set(key, stepNodeId);
          nodes.push({
            id: stepNodeId,
            type: 'step',
            data: { keyword: step.type, text: step.text },
            position: { x: featureX - 500, y: 320 + i * 100 },
          });
        }
        addEdge(prevBgNodeId, stepNodeId);
        prevBgNodeId = stepNodeId;
      });
    }

    // --- Scenario nodes ---
    const scenarioCount = feature.scenarios.length;
    const scenarioSpacing = 420;
    const scenariosWidth = (scenarioCount - 1) * scenarioSpacing;

    feature.scenarios.forEach((scenario, scenarioIndex) => {
      const scenarioX = featureX - scenariosWidth / 2 + scenarioIndex * scenarioSpacing;
      const scenarioY = 160;

      const scenarioNodeId = nextNodeId();
      nodes.push({
        id: scenarioNodeId,
        type: 'scenario',
        data: { label: scenario.name, tags: scenario.tags ?? [] },
        position: { x: scenarioX, y: scenarioY },
      });
      addEdge(featureNodeId, scenarioNodeId);

      // Chain steps sequentially: scenario → step1 → step2 → step3 ...
      let prevNodeId = scenarioNodeId;
      scenario.steps.forEach((step, stepIndex) => {
        const key = stepKey(step.type, step.text);
        let stepNodeId = sharedStepRegistry.get(key);

        if (!stepNodeId) {
          stepNodeId = nextNodeId();
          sharedStepRegistry.set(key, stepNodeId);
          nodes.push({
            id: stepNodeId,
            type: 'step',
            data: { keyword: step.type, text: step.text },
            position: { x: scenarioX, y: 320 + stepIndex * 100 },
          });
        }
        addEdge(prevNodeId, stepNodeId);
        prevNodeId = stepNodeId;
      });
    });
  }

  const commonActions = extractCommonActions(features);
  const scenarioCount = features.reduce((sum, f) => sum + f.scenarios.length, 0);

  return {
    nodes,
    edges,
    commonActions,
    metadata: {
      parsedAt: Date.now(),
      fileCount: features.length,
      scenarioCount,
      fileHashes,
    },
  };
}
