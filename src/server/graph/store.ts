/**
 * Typed graph store backed by an in-process SQLite database.
 * Holds the Gherkin suite as queryable nodes and typed edges, supports
 * incremental per-file updates, and answers impact / duplicate / health /
 * query requests via graph traversal.
 */

import Database from 'better-sqlite3';
import {
  GraphNodeRecord,
  GraphEdgeRecord,
  GraphNodeKind,
  GraphEdgeKind,
  ImpactResult,
  DuplicateCluster,
  HealthReport,
  HealthFinding,
  QueryRequest,
  QueryResultRow,
} from '../../shared/types';

interface NodeRow {
  id: string;
  kind: string;
  label: string;
  file: string;
  line: number;
  props: string;
}

interface EdgeRow {
  id: string;
  kind: string;
  source: string;
  target: string;
  props: string;
}

function rowToNode(row: NodeRow): GraphNodeRecord {
  return {
    id: row.id,
    kind: row.kind as GraphNodeKind,
    label: row.label,
    file: row.file,
    line: row.line,
    props: JSON.parse(row.props),
  };
}

export class GraphStore {
  private db: Database.Database;

  constructor() {
    this.db = new Database(':memory:');
    this.db.pragma('journal_mode = MEMORY');
    this.db.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER NOT NULL,
        props TEXT NOT NULL
      );
      CREATE TABLE edges (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        props TEXT NOT NULL
      );
      CREATE INDEX idx_nodes_kind ON nodes(kind);
      CREATE INDEX idx_nodes_file ON nodes(file);
      CREATE INDEX idx_edges_source ON edges(source);
      CREATE INDEX idx_edges_target ON edges(target);
      CREATE INDEX idx_edges_kind ON edges(kind);
    `);
  }

  reset(): void {
    this.db.exec('DELETE FROM nodes; DELETE FROM edges;');
  }

  transaction(fn: () => void): void {
    this.db.transaction(fn)();
  }

  upsertNode(node: GraphNodeRecord): void {
    this.db
      .prepare(
        `INSERT INTO nodes (id, kind, label, file, line, props)
         VALUES (@id, @kind, @label, @file, @line, @props)
         ON CONFLICT(id) DO UPDATE SET
           kind=excluded.kind, label=excluded.label,
           file=excluded.file, line=excluded.line, props=excluded.props`
      )
      .run({
        id: node.id,
        kind: node.kind,
        label: node.label,
        file: node.file,
        line: node.line,
        props: JSON.stringify(node.props),
      });
  }

  upsertEdge(edge: GraphEdgeRecord): void {
    this.db
      .prepare(
        `INSERT INTO edges (id, kind, source, target, props)
         VALUES (@id, @kind, @source, @target, @props)
         ON CONFLICT(id) DO UPDATE SET
           kind=excluded.kind, source=excluded.source,
           target=excluded.target, props=excluded.props`
      )
      .run({
        id: edge.id,
        kind: edge.kind,
        source: edge.source,
        target: edge.target,
        props: JSON.stringify(edge.props),
      });
  }

  /** Remove every node/edge that originated from a given feature file. */
  removeFile(file: string): void {
    const ids = this.db
      .prepare('SELECT id FROM nodes WHERE file = ?')
      .all(file)
      .map((r) => (r as { id: string }).id);
    const del = this.db.prepare('DELETE FROM edges WHERE source = ? OR target = ?');
    for (const id of ids) del.run(id, id);
    this.db.prepare('DELETE FROM nodes WHERE file = ?').run(file);
  }

  getNode(id: string): GraphNodeRecord | null {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow | undefined;
    return row ? rowToNode(row) : null;
  }

  private neighbors(id: string, kind: GraphEdgeKind, direction: 'out' | 'in'): string[] {
    const col = direction === 'out' ? 'source' : 'target';
    const other = direction === 'out' ? 'target' : 'source';
    return this.db
      .prepare(`SELECT ${other} AS v FROM edges WHERE ${col} = ? AND kind = ?`)
      .all(id, kind)
      .map((r) => (r as { v: string }).v);
  }

  private nodesByIds(ids: Iterable<string>): GraphNodeRecord[] {
    const out: GraphNodeRecord[] = [];
    const stmt = this.db.prepare('SELECT * FROM nodes WHERE id = ?');
    for (const id of ids) {
      const row = stmt.get(id) as NodeRow | undefined;
      if (row) out.push(rowToNode(row));
    }
    return out;
  }

  /**
   * Blast radius for editing a node.
   * Resolves the set of steps touched, the scenarios that consume those steps
   * (expanding background inheritance), their features, and any glue.
   */
  impact(rootId: string): ImpactResult | null {
    const root = this.getNode(rootId);
    if (!root) return null;

    const stepIds = new Set<string>();
    const scenarioIds = new Set<string>();

    const addScenariosUsingStep = (stepId: string) => {
      // Direct users (scenario or background nodes point at the step via USES_STEP)
      for (const userId of this.neighbors(stepId, 'USES_STEP', 'in')) {
        const user = this.getNode(userId);
        if (!user) continue;
        if (user.kind === 'scenario') {
          scenarioIds.add(user.id);
        } else if (user.kind === 'background') {
          for (const scId of this.neighbors(user.id, 'INHERITS_BACKGROUND', 'in')) {
            scenarioIds.add(scId);
          }
        }
      }
    };

    if (root.kind === 'step') {
      stepIds.add(root.id);
      addScenariosUsingStep(root.id);
    } else if (root.kind === 'stepdef') {
      for (const stepId of this.neighbors(root.id, 'MATCHES_GLUE', 'in')) {
        stepIds.add(stepId);
        addScenariosUsingStep(stepId);
      }
    } else if (root.kind === 'background') {
      for (const scId of this.neighbors(root.id, 'INHERITS_BACKGROUND', 'in')) {
        scenarioIds.add(scId);
      }
      for (const stepId of this.neighbors(root.id, 'USES_STEP', 'out')) {
        stepIds.add(stepId);
      }
    } else if (root.kind === 'scenario') {
      scenarioIds.add(root.id);
      for (const stepId of this.neighbors(root.id, 'USES_STEP', 'out')) {
        stepIds.add(stepId);
      }
    } else if (root.kind === 'feature') {
      for (const scId of this.neighbors(root.id, 'CONTAINS', 'out')) {
        const child = this.getNode(scId);
        if (child?.kind === 'scenario') scenarioIds.add(scId);
      }
    }

    const featureIds = new Set<string>();
    for (const scId of scenarioIds) {
      for (const fId of this.neighbors(scId, 'CONTAINS', 'in')) {
        const f = this.getNode(fId);
        if (f?.kind === 'feature') featureIds.add(fId);
      }
    }

    const stepDefIds = new Set<string>();
    for (const stepId of stepIds) {
      for (const defId of this.neighbors(stepId, 'MATCHES_GLUE', 'out')) {
        stepDefIds.add(defId);
      }
    }

    const scenarios = this.nodesByIds(scenarioIds).map((n) => ({
      id: n.id,
      label: n.label,
      file: n.file,
    }));
    const features = this.nodesByIds(featureIds).map((n) => ({
      id: n.id,
      label: n.label,
      file: n.file,
    }));
    const steps = this.nodesByIds(stepIds).map((n) => ({ id: n.id, label: n.label }));
    const stepDefs = this.nodesByIds(stepDefIds).map((n) => ({
      id: n.id,
      label: n.label,
      file: n.file,
      line: n.line,
    }));
    const files = new Set([...scenarios, ...features].map((n) => n.file));

    return {
      rootId: root.id,
      rootLabel: root.label,
      rootKind: root.kind,
      scenarios,
      features,
      steps,
      stepDefs,
      scenarioCount: scenarios.length,
      featureCount: features.length,
      fileCount: files.size,
    };
  }

  /** Near-duplicate clusters: templates shared by >1 distinct step text. */
  duplicateClusters(): DuplicateCluster[] {
    const rows = this.db
      .prepare(`SELECT * FROM nodes WHERE kind = 'step'`)
      .all() as NodeRow[];

    const byTemplate = new Map<string, GraphNodeRecord[]>();
    for (const row of rows) {
      const node = rowToNode(row);
      const template = node.props.template as string;
      if (!template) continue;
      if (!byTemplate.has(template)) byTemplate.set(template, []);
      byTemplate.get(template)!.push(node);
    }

    const clusters: DuplicateCluster[] = [];
    for (const nodes of byTemplate.values()) {
      const distinctTexts = new Set(nodes.map((n) => n.label.toLowerCase()));
      if (distinctTexts.size < 2) continue;

      const members: DuplicateCluster['members'] = [];
      for (const node of nodes) {
        const scenarios: string[] = node.props.scenarios ?? [];
        const filesForNode: string[] = node.props.files ?? [];
        members.push({
          id: node.id,
          text: node.label,
          file: filesForNode[0] ?? node.file,
          scenario: scenarios[0] ?? '',
        });
      }
      clusters.push({
        template: nodes[0].props.templateText as string,
        keywordType: nodes[0].props.keywordType,
        members,
        size: members.length,
      });
    }

    clusters.sort((a, b) => b.size - a.size);
    return clusters;
  }

  private countByKind(kind: GraphNodeKind): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM nodes WHERE kind = ?')
      .get(kind) as { c: number };
    return row.c;
  }

  private stepUsage(stepId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM edges WHERE target = ? AND kind = 'USES_STEP'`)
      .get(stepId) as { c: number };
    return row.c;
  }

  health(): HealthReport {
    const findings: HealthFinding[] = [];

    const stepRows = this.db.prepare(`SELECT * FROM nodes WHERE kind = 'step'`).all() as NodeRow[];
    let stepUsageTotal = 0;
    let sharedStepCount = 0;
    let matchedSteps = 0;

    for (const row of stepRows) {
      const node = rowToNode(row);
      const usage = this.stepUsage(node.id);
      stepUsageTotal += usage;
      if (usage > 1) sharedStepCount++;

      const glue = this.neighbors(node.id, 'MATCHES_GLUE', 'out');
      if (glue.length > 0) {
        matchedSteps++;
      }
    }

    // Unmatched steps only reported when glue exists in the suite at all.
    const stepDefCount = this.countByKind('stepdef');
    if (stepDefCount > 0) {
      for (const row of stepRows) {
        const node = rowToNode(row);
        if (this.neighbors(node.id, 'MATCHES_GLUE', 'out').length === 0) {
          findings.push({
            kind: 'unmatched-step',
            severity: 'error',
            message: `No step definition matches "${node.label}"`,
            file: (node.props.files?.[0] as string) ?? node.file,
            line: node.line,
            refId: node.id,
          });
        }
      }
    }

    // Unused step definitions
    const defRows = this.db.prepare(`SELECT * FROM nodes WHERE kind = 'stepdef'`).all() as NodeRow[];
    let unusedStepDefCount = 0;
    for (const row of defRows) {
      const node = rowToNode(row);
      if (this.neighbors(node.id, 'MATCHES_GLUE', 'in').length === 0) {
        unusedStepDefCount++;
        findings.push({
          kind: 'unused-stepdef',
          severity: 'warning',
          message: `Step definition "${node.label}" is never used`,
          file: node.file,
          line: node.line,
          refId: node.id,
        });
      }
    }

    // Empty features and step-less scenarios
    const featureRows = this.db
      .prepare(`SELECT * FROM nodes WHERE kind = 'feature'`)
      .all() as NodeRow[];
    for (const row of featureRows) {
      const node = rowToNode(row);
      const scenarioChildren = this.neighbors(node.id, 'CONTAINS', 'out').filter((id) => {
        const child = this.getNode(id);
        return child?.kind === 'scenario';
      });
      if (scenarioChildren.length === 0) {
        findings.push({
          kind: 'empty-feature',
          severity: 'warning',
          message: `Feature "${node.label}" has no scenarios`,
          file: node.file,
          line: node.line,
          refId: node.id,
        });
      }
    }

    const scenarioRows = this.db
      .prepare(`SELECT * FROM nodes WHERE kind = 'scenario'`)
      .all() as NodeRow[];
    for (const row of scenarioRows) {
      const node = rowToNode(row);
      if (this.neighbors(node.id, 'USES_STEP', 'out').length === 0) {
        findings.push({
          kind: 'stepless-scenario',
          severity: 'warning',
          message: `Scenario "${node.label}" has no steps`,
          file: node.file,
          line: node.line,
          refId: node.id,
        });
      }
    }

    // Contradictions: scenarios sharing an identical Context+Action prefix but
    // asserting different Outcomes.
    findings.push(...this.detectContradictions(scenarioRows));

    for (const cluster of this.duplicateClusters()) {
      findings.push({
        kind: 'duplicate-cluster',
        severity: 'info',
        message: `${cluster.size} steps share the shape "${cluster.template}"`,
        file: cluster.members[0].file,
        line: 0,
        refId: cluster.members[0].id,
      });
    }

    const scenarioCount = scenarioRows.length;
    const uniqueStepCount = stepRows.length;
    const featureCount = featureRows.length;

    return {
      findings,
      metrics: {
        featureCount,
        scenarioCount,
        uniqueStepCount,
        stepUsageCount: stepUsageTotal,
        sharedStepCount,
        reuseRatio: stepUsageTotal === 0 ? 0 : 1 - uniqueStepCount / stepUsageTotal,
        stepDefCount,
        matchedStepRatio: uniqueStepCount === 0 ? 0 : matchedSteps / uniqueStepCount,
        unusedStepDefCount,
      },
    };
  }

  private detectContradictions(scenarioRows: NodeRow[]): HealthFinding[] {
    const findings: HealthFinding[] = [];
    // Map "context+action prefix signature" → scenarios and their outcome signature.
    const byPrefix = new Map<string, Array<{ node: GraphNodeRecord; outcome: string }>>();

    for (const row of scenarioRows) {
      const node = rowToNode(row);
      const stepIds = this.orderedStepIds(node.id);
      const contextAction: string[] = [];
      const outcomes: string[] = [];
      for (const sid of stepIds) {
        const step = this.getNode(sid);
        if (!step) continue;
        const kt = step.props.keywordType;
        if (kt === 'Outcome') outcomes.push(step.label.toLowerCase());
        else contextAction.push(step.label.toLowerCase());
      }
      if (contextAction.length === 0 || outcomes.length === 0) continue;
      const prefix = contextAction.join(' | ');
      const outcomeSig = outcomes.sort().join(' | ');
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix)!.push({ node, outcome: outcomeSig });
    }

    for (const group of byPrefix.values()) {
      if (group.length < 2) continue;
      const outcomeSet = new Set(group.map((g) => g.outcome));
      if (outcomeSet.size > 1) {
        for (const g of group) {
          findings.push({
            kind: 'contradiction',
            severity: 'error',
            message: `Scenario "${g.node.label}" shares its setup with others but asserts a different outcome`,
            file: g.node.file,
            line: g.node.line,
            refId: g.node.id,
          });
        }
      }
    }
    return findings;
  }

  /** Step ids for a scenario, in authored order (props.order on the edge). */
  private orderedStepIds(scenarioId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT target, props FROM edges WHERE source = ? AND kind = 'USES_STEP'`
      )
      .all(scenarioId) as Array<{ target: string; props: string }>;
    return rows
      .map((r) => ({ id: r.target, order: JSON.parse(r.props).order ?? 0 }))
      .sort((a, b) => a.order - b.order)
      .map((r) => r.id);
  }

  query(req: QueryRequest): QueryResultRow[] {
    const stepRows = this.db.prepare(`SELECT * FROM nodes WHERE kind = 'step'`).all() as NodeRow[];
    const results: QueryResultRow[] = [];

    for (const row of stepRows) {
      const node = rowToNode(row);
      const usage = this.stepUsage(node.id);

      if (req.minUsage !== undefined && usage < req.minUsage) continue;
      if (req.keywordType && node.props.keywordType !== req.keywordType) continue;
      if (req.text && !node.label.toLowerCase().includes(req.text.toLowerCase())) continue;
      if (req.unmatchedOnly && this.neighbors(node.id, 'MATCHES_GLUE', 'out').length > 0) continue;
      if (req.tags && req.tags.length > 0) {
        const scenarioTags: string[] = node.props.tags ?? [];
        const hasAll = req.tags.every((t) => scenarioTags.includes(t));
        if (!hasAll) continue;
      }

      results.push({
        id: node.id,
        kind: node.kind,
        label: node.label,
        file: (node.props.files?.[0] as string) ?? node.file,
        line: node.line,
        usage,
      });
    }

    results.sort((a, b) => b.usage - a.usage);
    return results;
  }

  allTags(): string[] {
    const rows = this.db
      .prepare(`SELECT DISTINCT label FROM nodes WHERE kind = 'tag' ORDER BY label`)
      .all() as Array<{ label: string }>;
    return rows.map((r) => r.label);
  }
}

export const graphStore = new GraphStore();
