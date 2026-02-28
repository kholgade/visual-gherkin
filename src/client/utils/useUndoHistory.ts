/**
 * Generic undo history hook.
 * Tracks a stack of snapshots; undo pops to the previous state.
 * Does NOT redo — keeps it simple.
 */
import { useRef, useState, useCallback } from 'react';

export interface CanvasSnapshot {
  collapsedIds: Set<string>;
  positions: Map<string, { x: number; y: number }>;
}

const MAX_HISTORY = 50;

export function useUndoHistory(initial: CanvasSnapshot) {
  // Stack of past states (not including current)
  const historyRef = useRef<CanvasSnapshot[]>([]);
  const [current, setCurrent] = useState<CanvasSnapshot>(initial);

  /** Push current state to history, then apply next state */
  const push = useCallback((next: CanvasSnapshot) => {
    historyRef.current = [...historyRef.current.slice(-MAX_HISTORY + 1), current];
    setCurrent(next);
  }, [current]);

  /** Pop last snapshot — returns false if nothing to undo */
  const undo = useCallback((): boolean => {
    const history = historyRef.current;
    if (history.length === 0) return false;
    const prev = history[history.length - 1];
    historyRef.current = history.slice(0, -1);
    setCurrent(prev);
    return true;
  }, []);

  const canUndo = historyRef.current.length > 0;

  return { current, push, undo, canUndo };
}
