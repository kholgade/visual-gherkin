/**
 * Main App component
 */

import React from 'react';
import { FolderPicker } from '@client/pages/FolderPicker';
import { Canvas } from '@client/pages/Canvas';
import { useVisualization } from '@client/hooks/useVisualization';

const App: React.FC = () => {
  const { graph, loading, error, setGraph, setLoading, setError } = useVisualization();

  if (graph) {
    return <Canvas graph={graph} />;
  }

  return (
    <div className="app">
      <FolderPicker
        onLoadComplete={(g) => { setLoading(false); setGraph(g); }}
        onError={(e) => { setLoading(false); setError(e); }}
        loading={loading}
      />
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
};

export default App;
