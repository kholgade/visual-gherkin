/**
 * API routes for visual-gherkin server.
 * Exposes loading, live-reload (SSE), impact, duplicates, health, query,
 * glue, refactor (preview/apply), and git history.
 */

import express from 'express';
import path from 'path';
import { session } from '../services/session';
import { graphStore } from '../graph/store';
import { previewRefactor, applyRefactor } from '../services/refactor';
import { buildHistory } from '../services/history';
import { fileWatcher } from '../services/fileWatcher';
import {
  LoadDirRequest,
  LoadDirResponse,
  RefactorRequest,
  QueryRequest,
} from '../../shared/types';

const router = express.Router();

/** Connected SSE clients for live graph updates. */
const sseClients = new Set<express.Response>();

function broadcastGraph(): void {
  const graph = session.getGraph();
  if (!graph) return;
  const payload = `event: graph\ndata: ${JSON.stringify(graph)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// Re-parse the changed file, rebuild, and push to every connected client.
fileWatcher.subscribe((notification) => {
  try {
    session.applyFileChange(notification.type, notification.path);
    broadcastGraph();
  } catch (error) {
    console.error('Error applying file change:', error);
  }
});

function resolveDir(dirPath: string): string {
  const normalized = path.normalize(dirPath);
  return path.isAbsolute(normalized) ? normalized : path.join(process.cwd(), normalized);
}

router.post('/load-dir', (req, res) => {
  const { dirPath, gluePath } = req.body as LoadDirRequest;
  if (!dirPath || typeof dirPath !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid dirPath provided' } as LoadDirResponse);
  }

  const absolutePath = resolveDir(dirPath);
  const absoluteGlue = gluePath ? resolveDir(gluePath) : undefined;

  try {
    const graph = session.load(absolutePath, absoluteGlue);
    fileWatcher.start(absolutePath);
    res.json({ success: true, graph } as LoadDirResponse);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load directory',
    } as LoadDirResponse);
  }
});

router.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('event: ready\ndata: {}\n\n');
  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

router.get('/impact/:id', (req, res) => {
  const result = graphStore.impact(req.params.id);
  if (!result) {
    return res.status(404).json({ error: 'Node not found' });
  }
  res.json(result);
});

router.get('/duplicates', (_req, res) => {
  res.json({ clusters: graphStore.duplicateClusters() });
});

router.get('/health-report', (_req, res) => {
  res.json(graphStore.health());
});

router.get('/tags', (_req, res) => {
  res.json({ tags: graphStore.allTags() });
});

router.post('/query', (req, res) => {
  res.json({ rows: graphStore.query(req.body as QueryRequest) });
});

router.post('/refactor/preview', (req, res) => {
  try {
    const preview = previewRefactor(session.getFeatures(), graphStore, req.body as RefactorRequest);
    res.json(preview);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Preview failed' });
  }
});

router.post('/refactor/apply', (req, res) => {
  try {
    const edits = applyRefactor(session.getFeatures(), graphStore, req.body as RefactorRequest);
    const dir = session.getDirPath();
    if (dir) {
      session.load(dir);
    }
    broadcastGraph();
    res.json({ edits, graph: session.getGraph() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Apply failed' });
  }
});

router.get('/history', (req, res) => {
  const dir = session.getDirPath();
  if (!dir) {
    return res.status(400).json({ error: 'No directory loaded' });
  }
  const limit = Math.max(2, Math.min(50, parseInt(String(req.query.limit ?? '15'), 10) || 15));
  try {
    res.json({ diffs: buildHistory(dir, limit) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'History failed' });
  }
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default router;
