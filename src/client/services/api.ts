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
  AiStatus,
  AiMessage,
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

export function getAiStatus(): Promise<AiStatus> {
  return getJson<AiStatus>('/ai/status');
}

export interface AiStreamHandlers {
  onToken: (delta: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * Stream a grounded chat completion. Reads the server's SSE response from a
 * POST body (EventSource cannot POST). Returns an abort function.
 */
export function streamAiChat(
  body: { messages: AiMessage[]; nodeId?: string },
  handlers: AiStreamHandlers
): () => void {
  const controller = new AbortController();

  (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      handlers.onError(e instanceof Error ? e.message : 'Request failed');
      return;
    }

    if (!response.ok || !response.body) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      handlers.onError(err.error || 'Chat failed');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';

    const handleEvent = (raw: string) => {
      let eventName = 'message';
      let data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) return;
      const parsed = JSON.parse(data);
      if (eventName === 'token') handlers.onToken(parsed.delta);
      else if (eventName === 'tool') handlers.onToolCall(parsed.name, parsed.args);
      else if (eventName === 'done') handlers.onDone();
      else if (eventName === 'error') handlers.onError(parsed.message);
    };

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let boundary = pending.indexOf('\n\n');
        while (boundary !== -1) {
          handleEvent(pending.slice(0, boundary));
          pending = pending.slice(boundary + 2);
          boundary = pending.indexOf('\n\n');
        }
      }
      if (pending.trim()) handleEvent(pending);
    } catch (e) {
      if (!controller.signal.aborted) {
        handlers.onError(e instanceof Error ? e.message : 'Stream error');
      }
    }
  })();

  return () => controller.abort();
}
