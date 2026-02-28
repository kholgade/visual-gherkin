/**
 * API routes for visual-gherkin server
 */

import express from 'express';
import path from 'path';
import { parseDirectory, getDirectoryHashes } from '../services/parser/index';
import { buildVisualizationGraph } from '../services/analyzer/index';
import { saveCache, loadCache, isCacheValid, deleteCache } from '../services/cache';
import { fileWatcher } from '../services/fileWatcher';
import { LoadDirRequest, LoadDirResponse } from '../../shared/types';

const router = express.Router();

/**
 * POST /api/load-dir
 * Load and parse feature files from a directory
 * Uses cache if available and valid, otherwise parses and caches
 */
router.post('/load-dir', (req, res) => {
  try {
    const { dirPath } = req.body as LoadDirRequest;

    // Basic validation
    if (!dirPath || typeof dirPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid dirPath provided',
      } as LoadDirResponse);
    }

    // Normalize path (prevent path traversal)
    const normalizedPath = path.normalize(dirPath);
    const absolutePath = path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.join(process.cwd(), normalizedPath);

    // Get current file hashes for delta detection
    const currentHashes = getDirectoryHashes(absolutePath);

    // Check cache validity
    if (isCacheValid(absolutePath, currentHashes)) {
      const cachedGraph = loadCache(absolutePath);
      if (cachedGraph) {
        // Start file watcher for this directory
        if (!fileWatcher.isWatching()) {
          fileWatcher.start(absolutePath);
        }

        return res.json({
          success: true,
          graph: cachedGraph,
        } as LoadDirResponse);
      }
    }

    // Cache invalid or missing, parse directory
    const features = parseDirectory(absolutePath);

    if (features.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No .feature files found in directory',
      } as LoadDirResponse);
    }

    // Build visualization graph
    const graph = buildVisualizationGraph(features, currentHashes);

    // Save to cache
    saveCache(absolutePath, graph);

    // Start file watcher for this directory
    if (!fileWatcher.isWatching()) {
      fileWatcher.start(absolutePath);
    }

    res.json({
      success: true,
      graph,
    } as LoadDirResponse);
  } catch (error) {
    console.error('Error in /api/load-dir:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as LoadDirResponse);
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default router;
