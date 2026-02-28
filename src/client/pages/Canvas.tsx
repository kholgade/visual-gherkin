/**
 * Canvas page — renders the Gherkin hierarchy as a React Flow graph.
 * Nodes can be collapsed/expanded by clicking the toggle button on each node.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, { Node, Edge, Controls, Background, useNodesState } from 'reactflow';
import 'reactflow/dist/style.css';
import { VisualizationGraph } from '@shared/types';
import { nodeTypes } from '@client/components/nodes';
import { ControlPanel } from '@client/components/ControlPanel';
import { computeVisibility, computeSubtree } from '@client/utils/collapseUtils';

interface CanvasProps {
  graph: VisualizationGraph;
}

export const Canvas: React.FC<CanvasProps> = ({ graph }) => {
  const safeNodes = graph?.nodes ?? [];
  const safeEdges = graph?.edges ?? [];

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [highlightType, setHighlightType] = useState<string | null>(null);
  const [subtreeRoot, setSubtreeRoot] = useState<string | null>(null);

  const subtreeIds = useMemo(() =>
    subtreeRoot ? computeSubtree(subtreeRoot, safeEdges) : null,
    [subtreeRoot, safeEdges]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHighlightType(null);
        setSubtreeRoot(null);
      }
    };
    window.addEventListener('keydown', handler, true); // capture phase — before React Flow
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSubtreeRoot(prev => prev === node.id ? null : node.id); // toggle off if same
    setHighlightType(null); // clear type highlight when selecting subtree
  }, []);

  const onHighlightType = useCallback((type: string | null) => {
    setHighlightType(prev => prev === type ? null : type); // toggle off if same
  }, []);

  // Precompute shared step IDs (step nodes with >1 incoming edge)
  const sharedStepIds = useMemo(() => {
    const incomingCount = new Map<string, number>();
    safeEdges.forEach(e => incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1));
    return new Set(safeNodes.filter(n => n.type === 'step' && (incomingCount.get(n.id) ?? 0) > 1).map(n => n.id));
  }, [safeNodes, safeEdges]);

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
      return next;
    });
  }, []);

  const initialNodes: Node[] = useMemo(() => safeNodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: { ...node.data, collapsed: false, onToggle: toggleCollapse },
  })), [graph]);

  const [flowNodes, , onNodesChange] = useNodesState(initialNodes);

  // Derive display nodes and edges from collapse state — preserves drag positions
  const { displayNodes, displayEdges } = useMemo(() => {
    const { visibleNodeIds, hiddenEdgeIds } = computeVisibility(safeNodes, safeEdges, collapsedIds);

    const displayNodes = flowNodes.map(n => {
      const inSubtree = subtreeIds ? subtreeIds.has(n.id) : null;
      const isTypeHighlighted = highlightType !== null && (
        highlightType === 'shared' ? sharedStepIds.has(n.id) : n.type === highlightType
      );

      let style: React.CSSProperties | undefined;
      if (subtreeIds) {
        // Subtree mode: highlight members, dim non-members
        style = inSubtree
          ? { outline: '3px solid #3b82f6', borderRadius: 10, outlineOffset: 2 }
          : { opacity: 0.25 };
      } else if (highlightType !== null) {
        style = isTypeHighlighted
          ? { outline: '3px solid #f59e0b', borderRadius: 10, outlineOffset: 2 }
          : { opacity: 0.25 };
      }

      return {
        ...n,
        hidden: !visibleNodeIds.has(n.id),
        style,
        data: { ...n.data, collapsed: collapsedIds.has(n.id), onToggle: toggleCollapse },
      };
    });

    const displayEdges: Edge[] = safeEdges.map(edge => {
      const inSubtreeEdge = subtreeIds ? subtreeIds.has(edge.source) && subtreeIds.has(edge.target) : null;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        hidden: hiddenEdgeIds.has(edge.id),
        style: {
          stroke: edge.data?.color ?? '#ccc',
          strokeWidth: subtreeIds ? (inSubtreeEdge ? 2.5 : 0.5) : 1.5,
          opacity: subtreeIds ? (inSubtreeEdge ? 1 : 0.15) : highlightType ? 0.15 : 0.8,
        },
      };
    });

    return { displayNodes, displayEdges };
  }, [flowNodes, safeNodes, safeEdges, collapsedIds, toggleCollapse, highlightType, subtreeIds, sharedStepIds]);

  return (
    <div className="canvas-container">
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        nodesFocusable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
      <div className="canvas-overlay">
        <ControlPanel graph={graph} highlightType={highlightType} onHighlightType={onHighlightType} />
      </div>
    </div>
  );
};
