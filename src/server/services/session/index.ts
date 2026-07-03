/**
 * Session service.
 * Holds the currently loaded suite (parsed features + glue definitions),
 * rebuilds the render graph and typed store, and applies incremental per-file
 * updates so a single changed file re-parses only that file.
 */

import fs from 'fs';
import { ParsedFeature, GlueDefinition, VisualizationGraph } from '../../../shared/types';
import { parseDirectory, parseFeatureFile, getDirectoryHashes } from '../parser';
import { scanGlue } from '../glue';
import { buildGraph } from '../analyzer';
import { graphStore } from '../../graph/store';

class SessionService {
  private dirPath: string | null = null;
  private gluePath: string | null = null;
  private features = new Map<string, ParsedFeature>();
  private glueDefs: GlueDefinition[] = [];
  private graph: VisualizationGraph | null = null;

  getDirPath(): string | null {
    return this.dirPath;
  }

  getGraph(): VisualizationGraph | null {
    return this.graph;
  }

  getFeatures(): ParsedFeature[] {
    return Array.from(this.features.values());
  }

  private rebuild(): VisualizationGraph {
    const hashes = getDirectoryHashes(this.dirPath!);
    const { graph } = buildGraph(this.getFeatures(), this.glueDefs, hashes, graphStore);
    this.graph = graph;
    return graph;
  }

  load(dirPath: string, gluePath?: string): VisualizationGraph {
    this.dirPath = dirPath;
    this.gluePath = gluePath ?? dirPath;
    this.features.clear();
    for (const feature of parseDirectory(dirPath)) {
      this.features.set(feature.file, feature);
    }
    this.glueDefs = scanGlue(this.gluePath);
    if (this.features.size === 0) {
      throw new Error('No .feature files found in directory');
    }
    return this.rebuild();
  }

  /** Apply a single file change and rebuild the graph. Returns the new graph. */
  applyFileChange(type: 'file-added' | 'file-modified' | 'file-deleted', file: string): VisualizationGraph {
    if (!this.dirPath) {
      throw new Error('No directory loaded');
    }
    if (type === 'file-deleted') {
      this.features.delete(file);
    } else if (fs.existsSync(file)) {
      const parsed = parseFeatureFile(file);
      if (parsed) {
        this.features.set(file, parsed);
      } else {
        this.features.delete(file);
      }
    }
    return this.rebuild();
  }
}

export const session = new SessionService();
