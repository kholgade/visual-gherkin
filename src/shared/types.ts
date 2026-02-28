/**
 * Shared TypeScript types used across server and client
 */

export interface GherkinStep {
  type: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
  line: number;
}

export interface GherkinScenario {
  name: string;
  steps: GherkinStep[];
  line: number;
  tags?: string[];
}

export interface FeatureFile {
  path: string;
  name: string;
  scenarios: GherkinScenario[];
}

export interface ParsedFeature {
  file: string;
  feature: string;
  background: GherkinStep[];
  scenarios: GherkinScenario[];
}

export interface ActionStep {
  text: string;
  occurrences: Array<{
    scenario: string;
    file: string;
  }>;
}

export type NodeType = 'feature' | 'scenario' | 'step' | 'background';

export interface FlowNode {
  id: string;
  type: NodeType;
  data: Record<string, any>;
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  edgeKind: 'structural' | 'shared';
  data: {
    color?: string;
  };
}

export interface VisualizationGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  commonActions: ActionStep[];
  metadata: {
    parsedAt: number;
    fileCount: number;
    scenarioCount: number;
    fileHashes: Record<string, string>;
  };
}

export interface LoadDirRequest {
  dirPath: string;
}

export interface LoadDirResponse {
  success: boolean;
  graph: VisualizationGraph;
  error?: string;
}

export interface FileUpdateNotification {
  type: 'file-added' | 'file-deleted' | 'file-modified';
  path: string;
}
