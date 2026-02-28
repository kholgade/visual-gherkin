/**
 * File watcher service
 * Monitors .feature files for changes and notifies listeners
 */

import chokidar from 'chokidar';
import path from 'path';
import { FileUpdateNotification } from '../../shared/types';

type Listener = (notification: FileUpdateNotification) => void;

class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private listeners: Listener[] = [];
  private watchPath: string | null = null;

  /**
   * Start watching a directory for .feature file changes
   */
  start(dirPath: string): void {
    if (this.watcher) {
      this.stop();
    }

    this.watchPath = dirPath;

    this.watcher = chokidar.watch(path.join(dirPath, '**/*.feature'), {
      persistent: true,
      ignoreInitial: true,
      ignored: /(^|[\/\\])\.|node_modules/,
    });

    this.watcher.on('add', (filePath) => {
      this.notifyListeners({
        type: 'file-added',
        path: filePath,
      });
    });

    this.watcher.on('change', (filePath) => {
      this.notifyListeners({
        type: 'file-modified',
        path: filePath,
      });
    });

    this.watcher.on('unlink', (filePath) => {
      this.notifyListeners({
        type: 'file-deleted',
        path: filePath,
      });
    });

    console.log(`File watcher started for: ${dirPath}`);
  }

  /**
   * Stop watching for changes
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.watchPath = null;
      console.log('File watcher stopped');
    }
  }

  /**
   * Subscribe to file change notifications
   */
  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Notify all listeners of a file change
   */
  private notifyListeners(notification: FileUpdateNotification): void {
    for (const listener of this.listeners) {
      try {
        listener(notification);
      } catch (error) {
        console.error('Error in file watcher listener:', error);
      }
    }
  }

  /**
   * Get current watch path
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * Get the currently watched path
   */
  getWatchPath(): string | null {
    return this.watchPath;
  }
}

// Export singleton instance
export const fileWatcher = new FileWatcher();
