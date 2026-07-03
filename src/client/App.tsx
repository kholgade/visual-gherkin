/**
 * Main App component
 */

import React, { useEffect } from 'react';
import { FolderPicker } from '@client/pages/FolderPicker';
import { Canvas } from '@client/pages/Canvas';
import { useVisualization } from '@client/hooks/useVisualization';
import { subscribeGraph } from '@client/services/api';

const App: React.FC = () => {
  const { graph, loading, error, setGraph, setLoading, setError } = useVisualization();

  // Live reload: once a graph is loaded, apply pushed updates from the server.
  useEffect(() => {
    if (!graph) return;
    return subscribeGraph((next) => setGraph(next));
  }, [graph !== null, setGraph]);

  if (graph) {
    return <Canvas graph={graph} onGraphReplaced={setGraph} />;
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
