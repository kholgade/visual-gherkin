/**
 * FeatureNode — top-level feature file node
 * Purple theme, shows feature name + file path
 * Supports collapse/expand via toggle button
 */

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export const FeatureNode: React.FC<NodeProps> = ({ id, data }) => (
  <div style={{
    position: 'relative',
    background: '#f5f3ff',
    border: '2px solid #7c3aed',
    borderRadius: 10,
    padding: '10px 16px',
    minWidth: 240,
    maxWidth: 320,
    boxShadow: '0 2px 8px rgba(124,58,237,0.15)',
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
        background: '#ddd6fe',
        color: '#4c1d95',
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
    <div style={{ fontWeight: 700, fontSize: 14, color: '#4c1d95', marginBottom: 4, paddingRight: 22 }}>
      {data.label}
    </div>
    <div style={{ fontSize: 10, color: '#7c3aed', wordBreak: 'break-all' }}>
      {data.file}
    </div>
    <Handle type="source" position={Position.Right} />
  </div>
);
