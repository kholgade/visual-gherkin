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
  const [gluePath, setGluePath] = useState('');

  const handleLoadDirectory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!dirPath.trim()) {
      onError('Please enter a directory path');
      return;
    }

    try {
      const graph = await loadDirectory(dirPath.trim(), gluePath.trim() || undefined);
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
          <label htmlFor="glueInput" className="label">
            Step-definition (glue) directory — optional:
          </label>
          <input
            id="glueInput"
            type="text"
            value={gluePath}
            onChange={(e) => setGluePath(e.target.value)}
            placeholder="/path/to/step_definitions"
            className="input"
            disabled={loading}
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
          <p>🔗 Add a glue directory to link steps to their definitions</p>
          <p>📊 Impact, health, duplicates, refactors and history unlock once loaded</p>
        </div>
      </div>
    </div>
  );
};
