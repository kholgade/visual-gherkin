/**
 * Cache service
 * Saves and loads visualization graph to/from .gherkin-map.json
 * Enables fast reloads and delta detection
 */

import fs from 'fs';
import path from 'path';
import { VisualizationGraph } from '../../shared/types';

const CACHE_FILENAME = '.gherkin-map.json';

/**
 * Get path to cache file for a given directory
 */
function getCachePath(dirPath: string): string {
  return path.join(dirPath, CACHE_FILENAME);
}

/**
 * Save visualization graph to cache file
 */
export function saveCache(dirPath: string, graph: VisualizationGraph): boolean {
  try {
    const cachePath = getCachePath(dirPath);
    const cacheDir = path.dirname(cachePath);

    // Ensure directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    fs.writeFileSync(cachePath, JSON.stringify(graph, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error saving cache to ${dirPath}:`, error);
    return false;
  }
}

/**
 * Load visualization graph from cache file
 */
export function loadCache(dirPath: string): VisualizationGraph | null {
  try {
    const cachePath = getCachePath(dirPath);

    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const content = fs.readFileSync(cachePath, 'utf-8');
    const graph = JSON.parse(content) as VisualizationGraph;
    return graph;
  } catch (error) {
    console.error(`Error loading cache from ${dirPath}:`, error);
    return null;
  }
}

/**
 * Check if cache is valid by comparing file hashes
 * Returns true if all files match their cached hashes
 */
export function isCacheValid(
  dirPath: string,
  currentHashes: Record<string, string>
): boolean {
  const cache = loadCache(dirPath);

  if (!cache) {
    return false;
  }

  const cachedHashes = cache.metadata.fileHashes;

  // Check if all current files match cached hashes
  for (const [filePath, hash] of Object.entries(currentHashes)) {
    if (cachedHashes[filePath] !== hash) {
      return false;
    }
  }

  // Check if any files were removed
  for (const cachedPath of Object.keys(cachedHashes)) {
    if (!currentHashes[cachedPath]) {
      return false;
    }
  }

  return true;
}

/**
 * Delete cache file
 */
export function deleteCache(dirPath: string): boolean {
  try {
    const cachePath = getCachePath(dirPath);

    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      return true;
    }

    return true;
  } catch (error) {
    console.error(`Error deleting cache from ${dirPath}:`, error);
    return false;
  }
}
