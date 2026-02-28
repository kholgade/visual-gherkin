/**
 * Folder picker page
 * Allows user to select a directory containing .feature files
 */

import React, { useState } from 'react';
import { loadDirectory } from '@client/services/api';
import { VisualizationGraph } from '@shared/types';

interface FolderPickerProps {
  onLoadComplete: (graph: VisualizationGraph) => void;
  onError: (error: string) => void;
  loading: boolean;
}

export const FolderPicker: React.FC<FolderPickerProps> = ({
  onLoadComplete,
  onError,
  loading,
}) => {
  const [dirPath, setDirPath] = useState('');

  const handleLoadDirectory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!dirPath.trim()) {
      onError('Please enter a directory path');
      return;
    }

    try {
      const graph = await loadDirectory(dirPath);
      onLoadComplete(graph);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to load directory');
    }
  };

  return (
    <div className="folder-picker">
      <div className="picker-container">
        <h1>Visual Gherkin</h1>
        <p className="subtitle">Feature Map Visualizer</p>

        <form onSubmit={handleLoadDirectory}>
          <label htmlFor="dirInput" className="label">
            Enter feature directory path:
          </label>
          <input
            id="dirInput"
            type="text"
            value={dirPath}
            onChange={(e) => setDirPath(e.target.value)}
            placeholder="/path/to/features"
            className="input"
            disabled={loading}
            autoFocus
          />
          <button
            type="submit"
            className="button button-primary"
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load Features'}
          </button>
        </form>

        <div className="info">
          <p>📁 Select a directory containing <code>.feature</code> files</p>
          <p>📊 The app will analyze scenarios and show their relationships</p>
          <p>💾 A cache file will be created for faster reloads</p>
        </div>
      </div>
    </div>
  );
};
