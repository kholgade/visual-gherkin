/**
 * ScenarioNode — individual scenario / example block
 * Blue theme, shows scenario name + tags as badges
 * Supports collapse/expand via toggle button
 */

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export const ScenarioNode: React.FC<NodeProps> = ({ id, data }) => {
  const color = (data.color as string) ?? '#3b82f6';
  return (
  <div style={{
    position: 'relative',
    background: '#eff6ff',
    border: `2px solid ${color}`,
    borderRadius: 10,
    padding: '5px 10px',
    minWidth: 140,
    maxWidth: 220,
    boxShadow: `0 2px 8px ${color}30`,
  }}>
    <Handle type="target" position={Position.Left} />
    <button
      onClick={(e) => { e.stopPropagation(); data.onToggle?.(id); }}
      style={{
        position: 'absolute',
        top: 4,
        right: 4,
        width: 14,
        height: 14,
        border: 'none',
        borderRadius: '50%',
        background: '#bfdbfe',
        color: '#1e40af',
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
    <div style={{ fontWeight: 700, fontSize: 11, color: '#1e3a8a', marginBottom: 3, paddingRight: 18 }}>
      {data.label}
    </div>
    {Array.isArray(data.tags) && data.tags.length > 0 && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {(data.tags as string[]).map((tag, i) => (
          <span key={i} style={{
            background: '#bfdbfe',
            color: '#1e40af',
            borderRadius: 8,
            padding: '0px 5px',
            fontSize: 9,
            fontWeight: 600,
          }}>{tag}</span>
        ))}
      </div>
    )}
    <Handle type="source" position={Position.Right} />
  </div>
  );
};
