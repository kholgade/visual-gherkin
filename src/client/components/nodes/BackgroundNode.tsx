/**
 * BackgroundNode — shared background context block
 * Gray theme, shows "Background" label + step count
 */

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export const BackgroundNode: React.FC<NodeProps> = ({ data }) => (
  <div style={{
    background: '#f3f4f6',
    border: '2px solid #6b7280',
    borderRadius: 10,
    padding: '8px 14px',
    minWidth: 160,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  }}>
    <Handle type="target" position={Position.Top} />
    <div style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>Background</div>
    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
      {Array.isArray(data.steps) ? data.steps.length : 0} steps
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);
