/**
 * Client-side Dagre layout — recomputes node positions for the currently
 * visible set of nodes/edges after collapse state changes.
 */
import dagre from 'dagre';
import { FlowNode, FlowEdge } from '@shared/types';

const NODE_WIDTH: Record<string, number> = {
  feature: 280,
  scenario: 220,
  background: 180,
  step: 360,
};
const NODE_HEIGHT = 60;

/**
 * Returns a map of nodeId → {x, y} for visible nodes only.
 * Invisible nodes are excluded from layout so the graph reflows cleanly.
 */
export function computeLayout(
  visibleNodes: FlowNode[],
  visibleEdges: FlowEdge[]
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 100, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of visibleNodes) {
    const w = NODE_WIDTH[node.type] ?? 220;
    g.setNode(node.id, { width: w, height: NODE_HEIGHT });
  }

  const visibleIds = new Set(visibleNodes.map(n => n.id));
  for (const edge of visibleEdges) {
    if (visibleIds.has(edge.source) && visibleIds.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of visibleNodes) {
    const pos = g.node(node.id);
    if (pos) {
      positions.set(node.id, {
        x: pos.x - (NODE_WIDTH[node.type] ?? 220) / 2,
        y: pos.y - NODE_HEIGHT / 2,
      });
    }
  }
  return positions;
}
