/**
 * API client service
 * Handles communication with backend
 */

import { VisualizationGraph, LoadDirResponse } from '@shared/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Load and parse feature files from directory
 */
export async function loadDirectory(dirPath: string): Promise<VisualizationGraph> {
  const response = await fetch(`${API_BASE}/load-dir`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dirPath }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as LoadDirResponse;
    throw new Error(errorData.error || 'Failed to load directory');
  }

  const data = (await response.json()) as LoadDirResponse;
  if (!data.success) {
    throw new Error(data.error || 'Failed to parse features');
  }

  return data.graph;
}
