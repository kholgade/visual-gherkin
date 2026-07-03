/**
 * Analysis engine.
 * Builds two artifacts from parsed features:
 *   1. A render graph (feature → scenario/background → step) for React Flow,
 *      where identical steps share a single node.
 *   2. A typed, queryable graph in the SQLite store (features, scenarios,
 *      steps, backgrounds, tags, step definitions, examples and their edges),
 *      including step-definition (glue) links.
 */

import dagre from 'dagre';
import {
  ParsedFeature,
  ActionStep,
  FlowNode,
  FlowEdge,
  SubtreeEntry,
  VisualizationGraph,
  GlueDefinition,
  GraphNodeRecord,
} from '../../../shared/types';
import { GraphStore } from '../../graph/store';
import { exactStepKey, templateKey, templateText } from '../similarity';
import { compileGlue, matchStep, CompiledGlue } from '../glue';

const NODE_WIDTH: Record<string, number> = {
  feature: 180,
  scenario: 160,
  background: 120,
  step: 260,
};
const NODE_HEIGHT = 36;

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

function scenarioColor(index: number, total: number): string {
  const hue = Math.round((index / Math.max(total, 1)) * 360);
  return `hsl(${hue}, 70%, 45%)`;
}

function featureId(file: string): string {
  return `feature::${file}`;
}
function backgroundId(file: string): string {
  return `background::${file}`;
}
function scenarioId(file: string, line: number): string {
  return `scenario::${file}::${line}`;
}
function stepId(keywordType: string, text: string): string {
  return `step::${exactStepKey(keywordType, text)}`;
}
function tagId(name: string): string {
  return `tag::${name}`;
}
function stepDefId(def: GlueDefinition): string {
  return `stepdef::${def.file}::${def.line}`;
}

function extractCommonActions(features: ParsedFeature[]): ActionStep[] {
  const actionMap = new Map<string, ActionStep>();
  for (const feature of features) {
    for (const scenario of feature.scenarios) {
      for (const step of scenario.steps) {
        const key = exactStepKey(step.keywordType, step.text);
        if (!actionMap.has(key)) {
          actionMap.set(key, { text: step.text, occurrences: [] });
        }
        actionMap.get(key)!.occurrences.push({ scenario: scenario.name, file: feature.file });
      }
    }
  }
  return Array.from(actionMap.values()).filter((a) => a.occurrences.length > 1);
}

interface BuildResult {
  graph: VisualizationGraph;
}

/**
 * Populate the render graph and the typed store in a single pass.
 * The store is fully reset and rebuilt so cross-file shared steps stay correct.
 */
export function buildGraph(
  features: ParsedFeature[],
  glueDefs: GlueDefinition[],
  fileHashes: Record<string, string>,
  store: GraphStore
): BuildResult {
  const compiled: CompiledGlue[] = compileGlue(glueDefs);

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let edgeCounter = 0;
  const nextEdgeId = () => `e-${edgeCounter++}`;
  const renderedNodeIds = new Set<string>();

  const addRenderNode = (node: FlowNode) => {
    if (renderedNodeIds.has(node.id)) return;
    renderedNodeIds.add(node.id);
    nodes.push(node);
  };
  const addRenderEdge = (source: string, target: string, color?: string): string => {
    const id = nextEdgeId();
    edges.push({ id, source, target, edgeKind: 'structural', data: { color } });
    return id;
  };

  const subtreeMap: Record<string, SubtreeEntry> = {};

  // Aggregators for store step nodes (shared across scenarios/files).
  interface StepAgg {
    keywordType: string;
    text: string;
    scenarios: Set<string>;
    files: Set<string>;
    tags: Set<string>;
  }
  const stepAgg = new Map<string, StepAgg>();

  const storeNodes: GraphNodeRecord[] = [];
  const storeEdges = new Map<string, { kind: any; source: string; target: string; props: any }>();

  const addStoreNode = (node: GraphNodeRecord) => storeNodes.push(node);
  const addStoreEdge = (
    kind: string,
    source: string,
    target: string,
    props: Record<string, any> = {}
  ) => {
    const id = `${kind}::${source}::${target}`;
    if (!storeEdges.has(id)) {
      storeEdges.set(id, { kind, source, target, props });
    }
  };

  // Step definition nodes (added once each).
  glueDefs.forEach((def) => {
    addStoreNode({
      id: stepDefId(def),
      kind: 'stepdef',
      label: def.expression,
      file: def.file,
      line: def.line,
      props: { keyword: def.keyword, isRegex: def.isRegex, regexSource: def.regexSource },
    });
  });

  // Tag nodes discovered lazily.
  const ensureTag = (name: string) => {
    addStoreNode({ id: tagId(name), kind: 'tag', label: name, file: '', line: 0, props: {} });
  };

  const totalScenarios = features.reduce((sum, f) => sum + f.scenarios.length, 0);
  let scenarioColorIndex = 0;

  const registerStep = (
    keywordType: string,
    text: string,
    file: string,
    scenarioName: string,
    tags: string[]
  ): string => {
    const key = exactStepKey(keywordType, text);
    const id = stepId(keywordType, text);
    let agg = stepAgg.get(key);
    if (!agg) {
      agg = { keywordType, text, scenarios: new Set(), files: new Set(), tags: new Set() };
      stepAgg.set(key, agg);
    }
    if (scenarioName) agg.scenarios.add(scenarioName);
    agg.files.add(file);
    tags.forEach((t) => agg!.tags.add(t));
    return id;
  };

  for (const feature of features) {
    const fId = featureId(feature.file);
    addRenderNode({
      id: fId,
      type: 'feature',
      data: { label: feature.feature, file: feature.file, tags: feature.tags },
      position: { x: 0, y: 0 },
    });
    addStoreNode({
      id: fId,
      kind: 'feature',
      label: feature.feature,
      file: feature.file,
      line: feature.line,
      props: { tags: feature.tags, description: feature.description, language: feature.language },
    });
    feature.tags.forEach((t) => {
      ensureTag(t);
      addStoreEdge('TAGGED', fId, tagId(t));
    });

    const featureEntry: SubtreeEntry = { nodeIds: [fId], edgeIds: [] };

    // Background
    let backgroundNodeIds: string[] = [];
    let backgroundEdgeIds: string[] = [];
    const hasBackground = feature.background.length > 0;
    if (hasBackground) {
      const bgId = backgroundId(feature.file);
      addRenderNode({
        id: bgId,
        type: 'background',
        data: { label: 'Background', steps: feature.background },
        position: { x: 0, y: 0 },
      });
      addStoreNode({
        id: bgId,
        kind: 'background',
        label: 'Background',
        file: feature.file,
        line: feature.backgroundLine,
        props: {},
      });
      addStoreEdge('CONTAINS', fId, bgId);
      const bgEdge = addRenderEdge(fId, bgId);
      backgroundNodeIds = [bgId];
      backgroundEdgeIds = [bgEdge];

      let prevBg = bgId;
      feature.background.forEach((step, order) => {
        const sId = registerStep(step.keywordType, step.text, feature.file, '', feature.tags);
        addRenderNode({
          id: sId,
          type: 'step',
          data: {
            keyword: step.type,
            text: step.text,
            keywordType: step.keywordType,
            matched: matchStep(step, compiled).length > 0,
          },
          position: { x: 0, y: 0 },
        });
        const eid = addRenderEdge(prevBg, sId);
        addStoreEdge('USES_STEP', bgId, sId, { order });
        backgroundNodeIds.push(sId);
        backgroundEdgeIds.push(eid);
        prevBg = sId;
      });

      featureEntry.nodeIds.push(...backgroundNodeIds);
      featureEntry.edgeIds.push(...backgroundEdgeIds);
    }

    // Scenarios
    feature.scenarios.forEach((scenario) => {
      const color = scenarioColor(scenarioColorIndex++, totalScenarios);
      const scId = scenarioId(feature.file, scenario.line);

      addRenderNode({
        id: scId,
        type: 'scenario',
        data: {
          label: scenario.name,
          tags: scenario.tags,
          color,
          rule: scenario.rule,
          outline: scenario.examples.length > 0,
          exampleCount: scenario.examples.reduce((s, e) => s + e.rows.length, 0),
        },
        position: { x: 0, y: 0 },
      });
      addStoreNode({
        id: scId,
        kind: 'scenario',
        label: scenario.name,
        file: feature.file,
        line: scenario.line,
        props: { tags: scenario.tags, rule: scenario.rule, outline: scenario.examples.length > 0 },
      });
      addStoreEdge('CONTAINS', fId, scId);
      const scEdge = addRenderEdge(fId, scId, color);

      scenario.tags.forEach((t) => {
        ensureTag(t);
        addStoreEdge('TAGGED', scId, tagId(t));
      });
      if (hasBackground) {
        addStoreEdge('INHERITS_BACKGROUND', scId, backgroundId(feature.file));
      }

      // Example tables → example nodes
      scenario.examples.forEach((ex, exIdx) => {
        const exId = `example::${feature.file}::${scenario.line}::${exIdx}`;
        addStoreNode({
          id: exId,
          kind: 'example',
          label: ex.name || `Examples ${exIdx + 1}`,
          file: feature.file,
          line: ex.line,
          props: { header: ex.header, rowCount: ex.rows.length, tags: ex.tags },
        });
        addStoreEdge('INSTANTIATES', scId, exId, { rowCount: ex.rows.length });
      });

      const scenEntry: SubtreeEntry = {
        nodeIds: [...backgroundNodeIds, scId],
        edgeIds: [...backgroundEdgeIds, scEdge],
      };

      let prevNode = scId;
      scenario.steps.forEach((step, order) => {
        const sId = registerStep(
          step.keywordType,
          step.text,
          feature.file,
          scenario.name,
          scenario.tags
        );
        addRenderNode({
          id: sId,
          type: 'step',
          data: {
            keyword: step.type,
            text: step.text,
            keywordType: step.keywordType,
            matched: matchStep(step, compiled).length > 0,
          },
          position: { x: 0, y: 0 },
        });
        const eid = addRenderEdge(prevNode, sId, color);
        addStoreEdge('USES_STEP', scId, sId, { order });
        scenEntry.nodeIds.push(sId);
        scenEntry.edgeIds.push(eid);
        prevNode = sId;
      });

      subtreeMap[scId] = scenEntry;
      featureEntry.nodeIds.push(...scenEntry.nodeIds.filter((id) => !featureEntry.nodeIds.includes(id)));
      featureEntry.edgeIds.push(...scenEntry.edgeIds.filter((id) => !featureEntry.edgeIds.includes(id)));
    });

    subtreeMap[fId] = featureEntry;
  }

  // Finalize step nodes into the store (with template + glue links).
  for (const [key, agg] of stepAgg) {
    const id = stepId(agg.keywordType, agg.text);
    const files = Array.from(agg.files);
    addStoreNode({
      id,
      kind: 'step',
      label: agg.text,
      file: files[0] ?? '',
      line: 0,
      props: {
        keywordType: agg.keywordType,
        template: templateKey(agg.keywordType, agg.text),
        templateText: templateText(agg.text),
        scenarios: Array.from(agg.scenarios),
        files,
        tags: Array.from(agg.tags),
      },
    });

    const representativeStep = { text: agg.text } as any;
    for (const idx of matchStep(representativeStep, compiled)) {
      addStoreEdge('MATCHES_GLUE', id, stepDefId(compiled[idx].def));
    }
  }

  // Commit to the store in a single transaction.
  store.reset();
  store.transaction(() => {
    for (const node of storeNodes) store.upsertNode(node);
    for (const [id, e] of storeEdges) {
      store.upsertEdge({ id, kind: e.kind, source: e.source, target: e.target, props: e.props });
    }
  });

  applyDagreLayout(nodes, edges);

  const commonActions = extractCommonActions(features);
  const scenarioCount = features.reduce((sum, f) => sum + f.scenarios.length, 0);

  return {
    graph: {
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
    },
  };
}
