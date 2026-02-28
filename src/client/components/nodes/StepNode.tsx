/**
 * StepNode — individual Given/When/Then/And/But step
 * Pill shape, color-coded by keyword type
 */

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const KEYWORD_COLORS: Record<string, { bg: string; border: string; badge: string }> = {
  Given: { bg: '#eff6ff', border: '#3b82f6', badge: '#2563eb' },
  When:  { bg: '#fffbeb', border: '#f59e0b', badge: '#d97706' },
  Then:  { bg: '#f0fdf4', border: '#22c55e', badge: '#16a34a' },
  And:   { bg: '#f9fafb', border: '#9ca3af', badge: '#6b7280' },
  But:   { bg: '#f9fafb', border: '#9ca3af', badge: '#6b7280' },
};

export const StepNode: React.FC<NodeProps> = ({ data }) => {
  const keyword = (data.keyword as string) ?? 'And';
  const colors = KEYWORD_COLORS[keyword] ?? KEYWORD_COLORS['And'];

  return (
    <div style={{
      background: colors.bg,
      border: `1.5px solid ${colors.border}`,
      borderRadius: 20,
      padding: '4px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minWidth: 180,
      maxWidth: 460,
      boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
    }}>
      <Handle type="target" position={Position.Left} />
      <span style={{
        background: colors.badge,
        color: '#fff',
        borderRadius: 10,
        padding: '1px 7px',
        fontSize: 10,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}>{keyword}</span>
      <span style={{ fontSize: 11, color: '#374151', lineHeight: 1.4 }}>{data.text}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
};
