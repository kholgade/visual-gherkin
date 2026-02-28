/**
 * Control panel component
 * Displays statistics and legend for the visualization
 */

import React from 'react';
import { VisualizationGraph } from '@shared/types';

interface ControlPanelProps {
  graph: VisualizationGraph | null;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ graph }) => {
  if (!graph) return null;

  return (
    <div className="control-panel">
      <div className="panel-section">
        <h3>Statistics</h3>
        <div className="stat">
          <label>Files:</label>
          <span>{graph.metadata.fileCount}</span>
        </div>
        <div className="stat">
          <label>Scenarios:</label>
          <span>{graph.metadata.scenarioCount}</span>
        </div>
        <div className="stat">
          <label>Nodes:</label>
          <span>{graph.nodes.length}</span>
        </div>
        <div className="stat">
          <label>Shared Steps:</label>
          <span>{graph.edges.filter((e) => e.edgeKind === 'shared').length}</span>
        </div>
      </div>

      <div className="panel-section">
        <h3>Legend</h3>
        <div className="legend">
          <div className="legend-item">
            <div style={{ width: 14, height: 14, background: '#f5f3ff', border: '2px solid #7c3aed', borderRadius: 3 }} />
            <span>Feature</span>
          </div>
          <div className="legend-item">
            <div style={{ width: 14, height: 14, background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: 3 }} />
            <span>Scenario</span>
          </div>
          <div className="legend-item">
            <div style={{ width: 14, height: 14, background: '#f3f4f6', border: '2px solid #6b7280', borderRadius: 3 }} />
            <span>Background</span>
          </div>
          <div className="legend-item">
            <div style={{ width: 14, height: 14, background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: 10 }} />
            <span>Step (Given=blue, When=amber, Then=green)</span>
          </div>
          <div className="legend-item">
            <div style={{ width: 24, height: 2, background: '#667eea', borderTop: '2px dashed #667eea' }} />
            <span>Shared Step</span>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <h3>Instructions</h3>
        <ul className="instructions">
          <li>Drag nodes to rearrange</li>
          <li>Scroll to zoom</li>
          <li>Dashed blue lines = shared steps across scenarios</li>
        </ul>
      </div>
    </div>
  );
};
