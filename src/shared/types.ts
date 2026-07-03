/**
 * Shared TypeScript types used across server and client
 */

export type StepKeywordType = 'Context' | 'Action' | 'Outcome' | 'Conjunction' | 'Unknown';

export interface GherkinStep {
  /** Raw keyword as written, e.g. "Given", "And" */
  type: string;
  /** Cucumber keyword classification resolved through And/But into Given/When/Then */
  keywordType: StepKeywordType;
  text: string;
  line: number;
  dataTable?: string[][];
  docString?: string;
}

export interface ExampleTable {
  name: string;
  tags: string[];
  header: string[];
  rows: string[][];
  line: number;
}

export interface GherkinScenario {
  name: string;
  steps: GherkinStep[];
  line: number;
  tags: string[];
  /** Present when the scenario is a Scenario Outline */
  examples: ExampleTable[];
  /** Name of the enclosing Rule, if any */
  rule?: string;
}

export interface ParsedFeature {
  file: string;
  feature: string;
  description: string;
  language: string;
  tags: string[];
  background: GherkinStep[];
  backgroundLine: number;
  scenarios: GherkinScenario[];
  line: number;
}

/** A step-definition discovered in glue code */
export interface GlueDefinition {
  file: string;
  line: number;
  /** Source keyword hint (given/when/then/step) or 'step' when generic */
  keyword: string;
  /** The raw expression text (cucumber expression or regex source) */
  expression: string;
  /** Whether the expression was a regular expression literal */
  isRegex: boolean;
  /** Regex source compiled from the expression, used for matching */
  regexSource: string;
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

/** Pre-built subtree for a node (scenario or feature) — nodeIds and edgeIds in traversal order */
export interface SubtreeEntry {
  nodeIds: string[];
  edgeIds: string[];
}

export interface VisualizationGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  commonActions: ActionStep[];
  /** Keyed by scenario or feature node ID → its exact subtree (nodes + edges) */
  subtreeMap: Record<string, SubtreeEntry>;
  metadata: {
    parsedAt: number;
    fileCount: number;
    scenarioCount: number;
    fileHashes: Record<string, string>;
  };
}

/** ----- Graph model (persisted, queryable) ----- */

export type GraphNodeKind =
  | 'feature'
  | 'rule'
  | 'background'
  | 'scenario'
  | 'step'
  | 'tag'
  | 'stepdef'
  | 'example';

export type GraphEdgeKind =
  | 'CONTAINS'
  | 'USES_STEP'
  | 'INHERITS_BACKGROUND'
  | 'TAGGED'
  | 'MATCHES_GLUE'
  | 'INSTANTIATES';

export interface GraphNodeRecord {
  id: string;
  kind: GraphNodeKind;
  label: string;
  file: string;
  line: number;
  props: Record<string, any>;
}

export interface GraphEdgeRecord {
  id: string;
  kind: GraphEdgeKind;
  source: string;
  target: string;
  props: Record<string, any>;
}

/** ----- Analysis results ----- */

export interface ImpactResult {
  rootId: string;
  rootLabel: string;
  rootKind: GraphNodeKind;
  scenarios: Array<{ id: string; label: string; file: string }>;
  features: Array<{ id: string; label: string; file: string }>;
  steps: Array<{ id: string; label: string }>;
  stepDefs: Array<{ id: string; label: string; file: string; line: number }>;
  scenarioCount: number;
  featureCount: number;
  fileCount: number;
}

export interface DuplicateCluster {
  template: string;
  keywordType: StepKeywordType;
  members: Array<{ id: string; text: string; file: string; scenario: string }>;
  size: number;
}

export type HealthFindingKind =
  | 'unmatched-step'
  | 'unused-stepdef'
  | 'empty-feature'
  | 'stepless-scenario'
  | 'orphan-background'
  | 'contradiction'
  | 'duplicate-cluster';

export interface HealthFinding {
  kind: HealthFindingKind;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file: string;
  line: number;
  refId?: string;
}

export interface HealthReport {
  findings: HealthFinding[];
  metrics: {
    featureCount: number;
    scenarioCount: number;
    uniqueStepCount: number;
    stepUsageCount: number;
    sharedStepCount: number;
    reuseRatio: number;
    stepDefCount: number;
    matchedStepRatio: number;
    unusedStepDefCount: number;
  };
}

export interface QueryRequest {
  tags?: string[];
  minUsage?: number;
  keywordType?: StepKeywordType;
  text?: string;
  unmatchedOnly?: boolean;
}

export interface QueryResultRow {
  id: string;
  kind: GraphNodeKind;
  label: string;
  file: string;
  line: number;
  usage: number;
}

/** ----- Refactoring (write path) ----- */

export type RefactorKind = 'rename-step' | 'merge-steps' | 'extract-background';

export interface RefactorRequest {
  kind: RefactorKind;
  /** For rename-step / merge-steps: the canonical step node id */
  stepId?: string;
  /** For merge-steps: additional step node ids to fold into stepId */
  mergeIds?: string[];
  /** For rename-step / merge-steps: the new step text (keyword excluded) */
  newText?: string;
  /** For extract-background: the feature node id */
  featureId?: string;
  /** For extract-background: step node ids to hoist into the Background */
  extractStepIds?: string[];
}

export interface FileEdit {
  file: string;
  before: string;
  after: string;
}

export interface RefactorPreview {
  edits: FileEdit[];
  affectedScenarioCount: number;
  description: string;
}

/** ----- History (git) ----- */

export interface HistorySnapshot {
  commit: string;
  shortCommit: string;
  author: string;
  date: string;
  subject: string;
  featureCount: number;
  scenarioCount: number;
  uniqueStepCount: number;
  stepUsageCount: number;
}

export interface HistoryDiffEntry {
  from: HistorySnapshot;
  to: HistorySnapshot;
  featureDelta: number;
  scenarioDelta: number;
  stepDelta: number;
}

/** ----- Requests / responses ----- */

export interface LoadDirRequest {
  dirPath: string;
  gluePath?: string;
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

/** ----- LLM integration (OpenAI-compatible) ----- */

export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface AiStatus {
  configured: boolean;
  model: string;
  baseURL: string;
}

export interface AiChatRequest {
  messages: AiMessage[];
  /** Optional graph node whose context is injected to ground the answer. */
  nodeId?: string;
  /** Optional per-request provider overrides (non-secret). */
  model?: string;
  baseURL?: string;
}
