/**
 * Hook for managing visualization state
 * Handles graph data, expand/collapse, path highlighting
 */

import { useState, useCallback } from 'react';
import { VisualizationGraph, FlowNode, FlowEdge } from '@shared/types';

interface VisualizationState {
  graph: VisualizationGraph | null;
  expandedNodes: Set<string>;
  highlightedPath: Set<string>;
  selectedNode: string | null;
  loading: boolean;
  error: string | null;
}

export function useVisualization() {
  const [state, setState] = useState<VisualizationState>({
    graph: null,
    expandedNodes: new Set(),
    highlightedPath: new Set(),
    selectedNode: null,
    loading: false,
    error: null,
  });

  /**
   * Set the visualization graph
   */
  const setGraph = useCallback((graph: VisualizationGraph) => {
    setState((prev) => ({
      ...prev,
      graph,
      // All nodes start expanded
      expandedNodes: new Set(graph.nodes.map((n) => n.id)),
      error: null,
    }));
  }, []);

  /**
   * Toggle node expansion
   */
  const toggleNodeExpanded = useCallback((nodeId: string) => {
    setState((prev) => {
      const newExpanded = new Set(prev.expandedNodes);
      if (newExpanded.has(nodeId)) {
        newExpanded.delete(nodeId);
      } else {
        newExpanded.add(nodeId);
      }
      return { ...prev, expandedNodes: newExpanded };
    });
  }, []);

  /**
   * Highlight path from a node through shared steps
   * Shows all connected scenarios
   */
  const highlightPath = useCallback((nodeId: string) => {
    setState((prev) => {
      if (!prev.graph) return prev;

      const visited = new Set<string>();
      const queue: string[] = [nodeId];
      visited.add(nodeId);

      // BFS to find all connected nodes
      while (queue.length > 0) {
        const current = queue.shift()!;

        const edges = prev.graph.edges.filter(
          (e) => e.source === current || e.target === current
        );

        for (const edge of edges) {
          const next = edge.source === current ? edge.target : edge.source;
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }

      return {
        ...prev,
        highlightedPath: visited,
        selectedNode: nodeId,
      };
    });
  }, []);

  /**
   * Clear path highlighting
   */
  const clearHighlight = useCallback(() => {
    setState((prev) => ({
      ...prev,
      highlightedPath: new Set(),
      selectedNode: null,
    }));
  }, []);

  /**
   * Set loading state
   */
  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  /**
   * Set error state
   */
  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  return {
    ...state,
    setGraph,
    toggleNodeExpanded,
    highlightPath,
    clearHighlight,
    setLoading,
    setError,
  };
}
