/**
 * Computes visible node IDs and hidden edge IDs given collapsed nodes.
 * BFS from root nodes (Feature nodes — no incoming structural edges).
 * A collapsed node is visible itself but blocks traversal to its children.
 * Shared step nodes are visible if ANY non-collapsed parent can reach them.
 */
import { FlowNode, FlowEdge } from '@shared/types';

export function computeVisibility(
  nodes: FlowNode[],
  edges: FlowEdge[],
  collapsedIds: Set<string>
): { visibleNodeIds: Set<string>; hiddenEdgeIds: Set<string> } {
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();

  for (const edge of edges) {
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source)!.push(edge.target);
    if (!parentsOf.has(edge.target)) parentsOf.set(edge.target, []);
    parentsOf.get(edge.target)!.push(edge.source);
  }

  // Root nodes = nodes with no parents (Feature nodes)
  const rootIds = new Set(nodes.filter(n => !parentsOf.has(n.id)).map(n => n.id));

  // A node is visible if:
  //   - it is a root, OR
  //   - it has at least one parent that is visible AND not collapsed
  // We iterate until stable (handles shared nodes with multiple parents correctly)
  const visibleNodeIds = new Set<string>(rootIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (visibleNodeIds.has(node.id)) continue;
      const parents = parentsOf.get(node.id) ?? [];
      const reachable = parents.some(p => visibleNodeIds.has(p) && !collapsedIds.has(p));
      if (reachable) {
        visibleNodeIds.add(node.id);
        changed = true;
      }
    }
  }

  // Hidden edges: source collapsed, or either endpoint not visible
  const hiddenEdgeIds = new Set<string>();
  for (const edge of edges) {
    if (collapsedIds.has(edge.source) || !visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
      hiddenEdgeIds.add(edge.id);
    }
  }

  return { visibleNodeIds, hiddenEdgeIds };
}

