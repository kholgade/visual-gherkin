/**
 * Canvas page — renders the Gherkin hierarchy as a static React Flow graph.
 * Structural edges are solid gray; shared-step edges are dashed blue.
 */

import React, { useMemo } from 'react';
import ReactFlow, { Node, Edge, Controls, Background, useNodesState } from 'reactflow';
import 'reactflow/dist/style.css';
import { VisualizationGraph } from '@shared/types';
import { nodeTypes } from '@client/components/nodes';
import { ControlPanel } from '@client/components/ControlPanel';

interface CanvasProps {
  graph: VisualizationGraph;
}

export const Canvas: React.FC<CanvasProps> = ({ graph }) => {
  const safeNodes = graph?.nodes ?? [];
  const safeEdges = graph?.edges ?? [];

  const initialNodes: Node[] = useMemo(
    () =>
      safeNodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),
    [graph]
  );

  const edges: Edge[] = useMemo(
    () =>
      safeEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        style:
          edge.edgeKind === 'shared'
            ? { stroke: '#667eea', strokeDasharray: '5,5', strokeWidth: 2 }
            : { stroke: '#ccc', strokeWidth: 1 },
      })),
    [graph]
  );

  const [flowNodes, , onNodesChange] = useNodesState(initialNodes);

  return (
    <div className="canvas-container">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
      <div className="canvas-overlay">
        <ControlPanel graph={graph} />
      </div>
    </div>
  );
};
