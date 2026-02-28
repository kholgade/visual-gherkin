/**
 * ScenarioNode — individual scenario / example block
 * Blue theme, shows scenario name + tags as badges
 */

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export const ScenarioNode: React.FC<NodeProps> = ({ data }) => (
  <div style={{
    background: '#eff6ff',
    border: '2px solid #3b82f6',
    borderRadius: 10,
    padding: '10px 14px',
    minWidth: 200,
    maxWidth: 300,
    boxShadow: '0 2px 8px rgba(59,130,246,0.12)',
  }}>
    <Handle type="target" position={Position.Top} />
    <div style={{ fontWeight: 700, fontSize: 13, color: '#1e3a8a', marginBottom: 6 }}>
      {data.label}
    </div>
    {Array.isArray(data.tags) && data.tags.length > 0 && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {(data.tags as string[]).map((tag, i) => (
          <span key={i} style={{
            background: '#bfdbfe',
            color: '#1e40af',
            borderRadius: 12,
            padding: '1px 8px',
            fontSize: 10,
            fontWeight: 600,
          }}>{tag}</span>
        ))}
      </div>
    )}
    <Handle type="source" position={Position.Bottom} />
  </div>
);
