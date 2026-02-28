/**
 * BackgroundNode — shared background context block
 * Gray theme, shows "Background" label + step count
 * Supports collapse/expand via toggle button
 */

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export const BackgroundNode: React.FC<NodeProps> = ({ id, data }) => (
  <div style={{
    position: 'relative',
    background: '#f3f4f6',
    border: '2px solid #6b7280',
    borderRadius: 10,
    padding: '8px 14px',
    minWidth: 160,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  }}>
    <Handle type="target" position={Position.Left} />
    <button
      onClick={(e) => { e.stopPropagation(); data.onToggle?.(id); }}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        width: 18,
        height: 18,
        border: 'none',
        borderRadius: '50%',
        background: '#e5e7eb',
        color: '#374151',
        cursor: 'pointer',
        fontSize: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      {data.collapsed ? '▶' : '▼'}
    </button>
    <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', paddingRight: 22 }}>Background</div>
    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
      {Array.isArray(data.steps) ? data.steps.length : 0} steps
    </div>
    <Handle type="source" position={Position.Right} />
  </div>
);
