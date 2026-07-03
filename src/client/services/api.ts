/**
 * API client service
 * Handles communication with backend, including the live-reload event stream.
 */

import {
  VisualizationGraph,
  LoadDirResponse,
  ImpactResult,
  DuplicateCluster,
  HealthReport,
  QueryRequest,
  QueryResultRow,
  RefactorRequest,
  RefactorPreview,
  FileEdit,
  HistoryDiffEntry,
} from '@shared/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return response.json() as Promise<T>;
}

export async function loadDirectory(dirPath: string, gluePath?: string): Promise<VisualizationGraph> {
  const data = await postJson<LoadDirResponse>('/load-dir', { dirPath, gluePath });
  if (!data.success) {
    throw new Error(data.error || 'Failed to parse features');
  }
  return data.graph;
}

export function getImpact(nodeId: string): Promise<ImpactResult> {
  return getJson<ImpactResult>(`/impact/${encodeURIComponent(nodeId)}`);
}

export function getDuplicates(): Promise<{ clusters: DuplicateCluster[] }> {
  return getJson('/duplicates');
}

export function getHealth(): Promise<HealthReport> {
  return getJson<HealthReport>('/health-report');
}

export function getTags(): Promise<{ tags: string[] }> {
  return getJson('/tags');
}

export function runQuery(req: QueryRequest): Promise<{ rows: QueryResultRow[] }> {
  return postJson('/query', req);
}

export function previewRefactor(req: RefactorRequest): Promise<RefactorPreview> {
  return postJson<RefactorPreview>('/refactor/preview', req);
}

export function applyRefactor(
  req: RefactorRequest
): Promise<{ edits: FileEdit[]; graph: VisualizationGraph }> {
  return postJson('/refactor/apply', req);
}

export function getHistory(limit = 15): Promise<{ diffs: HistoryDiffEntry[] }> {
  return getJson(`/history?limit=${limit}`);
}

/** Subscribe to live graph updates. Returns an unsubscribe function. */
export function subscribeGraph(onGraph: (graph: VisualizationGraph) => void): () => void {
  const source = new EventSource(`${API_BASE}/events`);
  source.addEventListener('graph', (event) => {
    onGraph(JSON.parse((event as MessageEvent).data) as VisualizationGraph);
  });
  return () => source.close();
}
