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
  // Build child map from structural edges only
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();

  for (const edge of edges) {
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source)!.push(edge.target);
    if (!parentsOf.has(edge.target)) parentsOf.set(edge.target, []);
    parentsOf.get(edge.target)!.push(edge.source);
  }

  // Root nodes = nodes with no parents
  const roots = nodes.filter(n => !parentsOf.has(n.id)).map(n => n.id);

  // BFS
  const visibleNodeIds = new Set<string>(roots);
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (collapsedIds.has(current)) continue; // don't traverse into collapsed node's children
    for (const child of childrenOf.get(current) ?? []) {
      if (!visibleNodeIds.has(child)) {
        visibleNodeIds.add(child);
        queue.push(child);
      }
    }
  }

  // Hidden edges: source is collapsed, or source/target not visible
  const hiddenEdgeIds = new Set<string>();
  for (const edge of edges) {
    if (collapsedIds.has(edge.source) || !visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
      hiddenEdgeIds.add(edge.id);
    }
  }

  return { visibleNodeIds, hiddenEdgeIds };
}

/**
 * BFS downward from a root node — returns all node IDs reachable from it
 * via outgoing edges. Does NOT skip shared nodes; only traverses from this root.
 */
export function computeSubtree(rootId: string, edges: FlowEdge[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source)!.push(edge.target);
  }

  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenOf.get(current) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return result;
}
