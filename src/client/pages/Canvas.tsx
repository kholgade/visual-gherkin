/**
 * Canvas page — renders the Gherkin hierarchy as a React Flow graph.
 * Supports collapse/expand, subtree highlight, type highlight, and Ctrl+Z undo.
 * Undo covers both collapse state and node positions (drag moves).
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  Node, Edge, Controls, Background,
  useNodesState, useReactFlow, ReactFlowProvider, NodeDragHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { VisualizationGraph } from '@shared/types';
import { nodeTypes } from '@client/components/nodes';
import { ControlPanel } from '@client/components/ControlPanel';
import { computeVisibility } from '@client/utils/collapseUtils';
import { computeLayout } from '@client/utils/layoutUtils';
import { useUndoHistory, CanvasSnapshot } from '@client/utils/useUndoHistory';

interface CanvasProps {
  graph: VisualizationGraph;
}

/** Inner component — must be inside ReactFlowProvider to use useReactFlow */
const CanvasInner: React.FC<CanvasProps> = ({ graph }) => {
  const safeNodes = graph?.nodes ?? [];
  const safeEdges = graph?.edges ?? [];
  const { fitView } = useReactFlow();

  /** IDs of nodes that can be collapsed (feature, scenario, background) */
  const collapsibleIds = useMemo(() =>
    safeNodes.filter(n => n.type !== 'step').map(n => n.id),
    [safeNodes]
  );

  // Initial positions from server layout
  const initialPositions = useMemo(() =>
    new Map(safeNodes.map(n => [n.id, n.position])),
    [safeNodes]
  );

  const initialSnapshot: CanvasSnapshot = useMemo(() => ({
    collapsedIds: new Set(collapsibleIds),
    positions: initialPositions,
  }), []);

  const { current: snapshot, push, undo, canUndo } = useUndoHistory(initialSnapshot);
  const { collapsedIds, positions } = snapshot;

  const [highlightType, setHighlightType] = useState<string | null>(null);
  const [subtreeRoot, setSubtreeRoot] = useState<string | null>(null);

  /** Lookup subtree directly from pre-built map — O(1), no graph traversal */
  const subtreeEntry = subtreeRoot ? (graph.subtreeMap?.[subtreeRoot] ?? null) : null;
  const subtreeNodeIds = subtreeEntry ? new Set(subtreeEntry.nodeIds) : null;
  const subtreeEdgeIds = subtreeEntry ? new Set(subtreeEntry.edgeIds) : null;

  // Keyboard: Escape clears highlights, Ctrl+Z undoes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHighlightType(null);
        setSubtreeRoot(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [undo]);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSubtreeRoot(prev => prev === node.id ? null : node.id);
    setHighlightType(null);
  }, []);

  const onHighlightType = useCallback((type: string | null) => {
    setHighlightType(prev => prev === type ? null : type);
  }, []);

  // Precompute shared step IDs (step nodes with >1 incoming edge)
  const sharedStepIds = useMemo(() => {
    const incomingCount = new Map<string, number>();
    safeEdges.forEach(e => incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1));
    return new Set(safeNodes.filter(n => n.type === 'step' && (incomingCount.get(n.id) ?? 0) > 1).map(n => n.id));
  }, [safeNodes, safeEdges]);

  /** Snapshot current state then apply new collapsedIds with recomputed layout */
  const applyCollapse = useCallback((nextCollapsedIds: Set<string>) => {
    const { visibleNodeIds, hiddenEdgeIds } = computeVisibility(safeNodes, safeEdges, nextCollapsedIds);
    const visibleFlowNodes = safeNodes.filter(n => visibleNodeIds.has(n.id));
    const visibleFlowEdges = safeEdges.filter(e => !hiddenEdgeIds.has(e.id));
    const newPositions = computeLayout(visibleFlowNodes, visibleFlowEdges);
    push({ collapsedIds: nextCollapsedIds, positions: newPositions });
  }, [collapsedIds, positions, safeNodes, safeEdges, push]);

  const toggleCollapse = useCallback((nodeId: string) => {
    const next = new Set(collapsedIds);
    next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
    applyCollapse(next);
  }, [collapsedIds, applyCollapse]);

  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every(id => collapsedIds.has(id));

  const onToggleAll = useCallback(() => {
    applyCollapse(allCollapsed ? new Set() : new Set(collapsibleIds));
  }, [allCollapsed, collapsibleIds, applyCollapse]);

  // Build initial React Flow nodes
  const initialNodes: Node[] = useMemo(() => safeNodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: positions.get(node.id) ?? node.position,
    data: { ...node.data, collapsed: collapsedIds.has(node.id), onToggle: toggleCollapse },
  })), [graph]);

  const [flowNodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  // Sync flowNodes positions and collapsed state when snapshot changes (undo or collapse)
  useEffect(() => {
    const { visibleNodeIds } = computeVisibility(safeNodes, safeEdges, collapsedIds);
    setNodes(prev => prev.map(n => ({
      ...n,
      position: positions.get(n.id) ?? n.position,
      data: { ...n.data, collapsed: collapsedIds.has(n.id), onToggle: toggleCollapse },
    })));
    // fitView only over visible nodes so hidden nodes don't affect the viewport
    const visibleIds = Array.from(visibleNodeIds).map(id => ({ id }));
    requestAnimationFrame(() => fitView({ duration: 300, nodes: visibleIds }));
  }, [snapshot]);

  /** On drag end — snapshot current state with new positions */
  const onNodeDragStop: NodeDragHandler = useCallback((_evt, _node, draggedNodes) => {
    const updatedPositions = new Map(positions);
    draggedNodes.forEach(n => updatedPositions.set(n.id, n.position));
    push({ collapsedIds, positions: updatedPositions });
  }, [collapsedIds, positions, push]);

  // Derive display nodes and edges
  const { displayNodes, displayEdges } = useMemo(() => {
    const { visibleNodeIds, hiddenEdgeIds } = computeVisibility(safeNodes, safeEdges, collapsedIds);

    const displayNodes = flowNodes.map(n => {
      const inSubtree = subtreeNodeIds ? subtreeNodeIds.has(n.id) : null;
      const isTypeHighlighted = highlightType !== null && (
        highlightType === 'shared' ? sharedStepIds.has(n.id) : n.type === highlightType
      );

      let style: React.CSSProperties | undefined;
      if (subtreeNodeIds) {
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
      const inSubtreeEdge = subtreeEdgeIds ? subtreeEdgeIds.has(edge.id) : null;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        hidden: hiddenEdgeIds.has(edge.id),
        style: {
          stroke: edge.data?.color ?? '#ccc',
          strokeWidth: subtreeEdgeIds ? (inSubtreeEdge ? 2.5 : 0.5) : 1.5,
          opacity: subtreeEdgeIds ? (inSubtreeEdge ? 1 : 0.15) : highlightType ? 0.15 : 0.8,
        },
      };
    });

    return { displayNodes, displayEdges };
  }, [flowNodes, safeNodes, safeEdges, collapsedIds, toggleCollapse, highlightType, subtreeNodeIds, subtreeEdgeIds, sharedStepIds]);

  return (
    <div className="canvas-container">
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        nodesFocusable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        minZoom={0.05}
        maxZoom={2}
        panOnScroll={false}
        zoomOnScroll={true}
        panOnDrag={true}
        translateExtent={[[-100000, -100000], [100000, 100000]]}
      >
        <Background />
        <Controls />
      </ReactFlow>
      <div className="canvas-overlay">
        <ControlPanel
          graph={graph}
          highlightType={highlightType}
          onHighlightType={onHighlightType}
          allCollapsed={allCollapsed}
          onToggleAll={onToggleAll}
          canUndo={canUndo}
          onUndo={undo}
        />
      </div>
    </div>
  );
};

/** Wrap in ReactFlowProvider so useReactFlow is available inside CanvasInner */
export const Canvas: React.FC<CanvasProps> = (props) => (
  <ReactFlowProvider>
    <CanvasInner {...props} />
  </ReactFlowProvider>
);
