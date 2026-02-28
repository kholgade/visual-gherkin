/**
 * Control panel component — collapsible floating panel
 * Collapses to a small icon button when minimized
 */

import React, { useState } from 'react';
import { VisualizationGraph } from '@shared/types';

interface ControlPanelProps {
  graph: VisualizationGraph | null;
  highlightType: string | null;
  onHighlightType: (type: string | null) => void;
  allCollapsed: boolean;
  onToggleAll: () => void;
  canUndo: boolean;
  onUndo: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ graph, highlightType, onHighlightType, allCollapsed, onToggleAll, canUndo, onUndo }) => {
  const [expanded, setExpanded] = useState(true);

  if (!graph) return null;

  const statStyle = (type: string): React.CSSProperties => ({
    cursor: 'pointer',
    borderRadius: 4,
    padding: '2px 4px',
    margin: '-2px -4px',
    background: highlightType === type ? '#fef3c7' : 'transparent',
    outline: highlightType === type ? '1.5px solid #f59e0b' : 'none',
  });

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        title="Show panel"
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'white', border: '1.5px solid #e0e0e0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          cursor: 'pointer', fontSize: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ☰
      </button>
    );
  }

  return (
    <div className="control-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: '#333', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Panel</span>
        <button
          onClick={() => setExpanded(false)}
          title="Collapse panel"
          style={{
            width: 20, height: 20, borderRadius: '50%',
            background: '#f0f0f0', border: 'none',
            cursor: 'pointer', fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      <div className="panel-section">
        <h3>Statistics</h3>
        {(() => {
          const featureCount = graph.nodes.filter(n => n.type === 'feature').length;
          const scenarioCount = graph.nodes.filter(n => n.type === 'scenario').length;
          const backgroundCount = graph.nodes.filter(n => n.type === 'background').length;
          const stepCount = graph.nodes.filter(n => n.type === 'step').length;
          // Shared steps = step nodes with more than one incoming structural edge
          const incomingCount = new Map<string, number>();
          graph.edges.forEach(e => incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1));
          const sharedStepCount = graph.nodes.filter(n => n.type === 'step' && (incomingCount.get(n.id) ?? 0) > 1).length;
          return <>
            <div className="stat" style={statStyle('feature')} onClick={() => onHighlightType('feature')}><label>Features:</label><span>{featureCount}</span></div>
            <div className="stat" style={statStyle('scenario')} onClick={() => onHighlightType('scenario')}><label>Scenarios:</label><span>{scenarioCount}</span></div>
            <div className="stat" style={statStyle('background')} onClick={() => onHighlightType('background')}><label>Backgrounds:</label><span>{backgroundCount}</span></div>
            <div className="stat" style={statStyle('step')} onClick={() => onHighlightType('step')}><label>Steps:</label><span>{stepCount}</span></div>
            <div className="stat" style={statStyle('shared')} onClick={() => onHighlightType('shared')}><label>Shared Steps:</label><span>{sharedStepCount}</span></div>
          </>;
        })()}
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
            <div style={{ width: 14, height: 14, borderRadius: 10, background: '#eff6ff', border: '2px solid #3b82f6' }} />
            <span>Step</span>
          </div>
          <div className="legend-item">
            <div style={{ width: 24, height: 0, borderTop: '2px dashed #667eea' }} />
            <span>Shared Step</span>
          </div>
        </div>
      </div>

      <div className="panel-section" style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onToggleAll}
          style={{
            flex: 1,
            padding: '6px 0',
            border: '1.5px solid #d1d5db',
            borderRadius: 6,
            background: allCollapsed ? '#f0fdf4' : '#fef9c3',
            color: allCollapsed ? '#166534' : '#854d0e',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {allCollapsed ? '▶ Expand All' : '▼ Collapse All'}
        </button>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          style={{
            padding: '6px 10px',
            border: '1.5px solid #d1d5db',
            borderRadius: 6,
            background: canUndo ? '#f0f9ff' : '#f9fafb',
            color: canUndo ? '#1e40af' : '#9ca3af',
            fontWeight: 600,
            fontSize: 12,
            cursor: canUndo ? 'pointer' : 'not-allowed',
          }}
        >
          ↩ Undo
        </button>
      </div>
    </div>
  );
};
