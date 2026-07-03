/**
 * Insights panel — surfaces the graph analysis services:
 * Impact (blast radius), Health report, Duplicate clusters, Query, Refactor
 * preview/apply, and Git history. Selecting a result focuses it on the canvas.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  VisualizationGraph,
  ImpactResult,
  HealthReport,
  DuplicateCluster,
  QueryResultRow,
  RefactorPreview,
  HistoryDiffEntry,
  StepKeywordType,
  AiStatus,
  AiMessage,
} from '@shared/types';
import * as api from '@client/services/api';

type Tab = 'impact' | 'health' | 'duplicates' | 'query' | 'refactor' | 'history' | 'ai';

interface InsightsPanelProps {
  graph: VisualizationGraph;
  selectedNodeId: string | null;
  onFocusNode: (id: string) => void;
  onGraphReplaced: (graph: VisualizationGraph) => void;
}

function nodeKind(id: string): string {
  return id.split('::', 1)[0];
}

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'impact', label: 'Impact' },
  { key: 'health', label: 'Health' },
  { key: 'duplicates', label: 'Duplicates' },
  { key: 'query', label: 'Query' },
  { key: 'refactor', label: 'Refactor' },
  { key: 'history', label: 'History' },
  { key: 'ai', label: 'Ask AI' },
];

const quickBtn: React.CSSProperties = {
  fontSize: 10,
  padding: '3px 6px',
  borderRadius: 5,
  border: '1px solid #c7d2fe',
  background: '#eef2ff',
  color: '#3730a3',
  cursor: 'pointer',
};

const cellBtn: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid #f1f5f9',
  padding: '4px 2px',
  fontSize: 11,
  color: '#334155',
  cursor: 'pointer',
};

export const InsightsPanel: React.FC<InsightsPanelProps> = ({
  graph,
  selectedNodeId,
  onFocusNode,
  onGraphReplaced,
}) => {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('impact');
  const [error, setError] = useState<string | null>(null);

  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCluster[] | null>(null);
  const [history, setHistory] = useState<HistoryDiffEntry[] | null>(null);

  const [queryText, setQueryText] = useState('');
  const [minUsage, setMinUsage] = useState('');
  const [keywordType, setKeywordType] = useState<StepKeywordType | ''>('');
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [queryRows, setQueryRows] = useState<QueryResultRow[] | null>(null);

  const [newText, setNewText] = useState('');
  const [preview, setPreview] = useState<RefactorPreview | null>(null);

  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiPartial, setAiPartial] = useState('');
  const [aiTools, setAiTools] = useState<string[]>([]);
  const aiBufferRef = useRef('');
  const aiAbortRef = useRef<(() => void) | null>(null);

  const wrap = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  }, []);

  // Auto-load Impact when a node is selected.
  useEffect(() => {
    if (tab !== 'impact' || !selectedNodeId) {
      setImpact(null);
      return;
    }
    wrap(async () => setImpact(await api.getImpact(selectedNodeId)));
  }, [tab, selectedNodeId, graph, wrap]);

  const loadAiStatus = () => wrap(async () => setAiStatus(await api.getAiStatus()));

  const sendAi = useCallback((text: string) => {
    if (!text.trim() || aiStreaming) return;
    const history: AiMessage[] = [...aiMessages, { role: 'user', content: text.trim() }];
    setAiMessages(history);
    setAiInput('');
    setAiPartial('');
    setAiTools([]);
    setError(null);
    aiBufferRef.current = '';
    setAiStreaming(true);

    aiAbortRef.current = api.streamAiChat(
      { messages: history, nodeId: selectedNodeId ?? undefined },
      {
        onToken: (delta) => {
          aiBufferRef.current += delta;
          setAiPartial(aiBufferRef.current);
        },
        onToolCall: (name) => setAiTools((prev) => [...prev, name]),
        onDone: () => {
          setAiMessages((prev) => [...prev, { role: 'assistant', content: aiBufferRef.current }]);
          setAiPartial('');
          setAiStreaming(false);
        },
        onError: (message) => {
          setError(message);
          setAiStreaming(false);
        },
      }
    );
  }, [aiMessages, aiStreaming, selectedNodeId]);

  const loadHealth = () => wrap(async () => setHealth(await api.getHealth()));
  const loadDuplicates = () =>
    wrap(async () => setDuplicates((await api.getDuplicates()).clusters));
  const loadHistory = () => wrap(async () => setHistory((await api.getHistory()).diffs));

  const runQuery = () =>
    wrap(async () => {
      const rows = (
        await api.runQuery({
          text: queryText || undefined,
          minUsage: minUsage ? parseInt(minUsage, 10) : undefined,
          keywordType: keywordType || undefined,
          unmatchedOnly: unmatchedOnly || undefined,
        })
      ).rows;
      setQueryRows(rows);
    });

  const doPreview = () =>
    wrap(async () => {
      if (!selectedNodeId || nodeKind(selectedNodeId) !== 'step') {
        throw new Error('Select a step node on the canvas first');
      }
      setPreview(
        await api.previewRefactor({ kind: 'rename-step', stepId: selectedNodeId, newText })
      );
    });

  const doApply = () =>
    wrap(async () => {
      if (!selectedNodeId) return;
      const { graph: next } = await api.applyRefactor({
        kind: 'rename-step',
        stepId: selectedNodeId,
        newText,
      });
      setPreview(null);
      setNewText('');
      onGraphReplaced(next);
    });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Show insights"
        style={{
          position: 'absolute', top: 16, right: 16, zIndex: 10,
          width: 36, height: 36, borderRadius: '50%', background: 'white',
          border: '1.5px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          cursor: 'pointer', fontSize: 16,
        }}
      >📊</button>
    );
  }

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, zIndex: 10, width: 320,
      maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      background: 'white', borderRadius: 8, border: '1px solid #e5e7eb',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid #eee' }}>
        <span style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#334155' }}>Insights</span>
        <button onClick={() => setOpen(false)} style={{ border: 'none', background: '#f0f0f0', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 8px', borderBottom: '1px solid #eee' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              if (t.key === 'health') loadHealth();
              if (t.key === 'duplicates') loadDuplicates();
              if (t.key === 'history') loadHistory();
              if (t.key === 'ai' && !aiStatus) loadAiStatus();
            }}
            style={{
              fontSize: 11, padding: '3px 7px', borderRadius: 5, cursor: 'pointer',
              border: '1px solid #d1d5db',
              background: tab === t.key ? '#4c1d95' : '#f8fafc',
              color: tab === t.key ? 'white' : '#475569',
            }}
          >{t.label}</button>
        ))}
      </div>

      <div style={{ overflowY: 'auto', padding: '8px 10px', fontSize: 12 }}>
        {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

        {tab === 'impact' && (
          <div>
            {!selectedNodeId && <p style={{ color: '#64748b' }}>Click a node to see its blast radius.</p>}
            {selectedNodeId && !impact && <p style={{ color: '#64748b' }}>Loading impact…</p>}
            {impact && (
              <div>
                <p style={{ fontWeight: 600 }}>{impact.rootKind}: {impact.rootLabel}</p>
                <p style={{ color: '#475569', margin: '4px 0' }}>
                  {impact.scenarioCount} scenario(s), {impact.featureCount} feature(s), {impact.fileCount} file(s), {impact.stepDefs.length} step def(s)
                </p>
                <strong style={{ fontSize: 11 }}>Scenarios</strong>
                {impact.scenarios.map((s) => (
                  <button key={s.id} style={cellBtn} onClick={() => onFocusNode(s.id)} title={s.file}>{s.label}</button>
                ))}
                {impact.stepDefs.length > 0 && <strong style={{ fontSize: 11 }}>Step definitions</strong>}
                {impact.stepDefs.map((d) => (
                  <div key={d.id} style={{ ...cellBtn, cursor: 'default' }}>{d.label} <span style={{ color: '#94a3b8' }}>({d.file.split('/').pop()}:{d.line})</span></div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'health' && (
          <div>
            <button onClick={loadHealth} style={{ ...cellBtn, color: '#4c1d95', fontWeight: 600 }}>↻ Refresh</button>
            {health && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 2, margin: '6px 0', color: '#475569' }}>
                  <span>Reuse ratio</span><b>{(health.metrics.reuseRatio * 100).toFixed(0)}%</b>
                  <span>Glue coverage</span><b>{(health.metrics.matchedStepRatio * 100).toFixed(0)}%</b>
                  <span>Shared steps</span><b>{health.metrics.sharedStepCount}</b>
                  <span>Unused step defs</span><b>{health.metrics.unusedStepDefCount}</b>
                </div>
                {health.findings.map((f, i) => (
                  <button
                    key={i}
                    style={{ ...cellBtn, color: f.severity === 'error' ? '#dc2626' : f.severity === 'warning' ? '#b45309' : '#475569' }}
                    onClick={() => f.refId && onFocusNode(f.refId)}
                    title={`${f.file}:${f.line}`}
                  >{f.severity === 'error' ? '⛔' : f.severity === 'warning' ? '⚠' : 'ℹ'} {f.message}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'duplicates' && (
          <div>
            <button onClick={loadDuplicates} style={{ ...cellBtn, color: '#4c1d95', fontWeight: 600 }}>↻ Refresh</button>
            {duplicates && duplicates.length === 0 && <p style={{ color: '#64748b' }}>No near-duplicate step shapes found.</p>}
            {duplicates && duplicates.map((c, i) => (
              <div key={i} style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 0' }}>
                <div style={{ fontWeight: 600, fontSize: 11 }}>{c.size}× {c.template}</div>
                {c.members.map((m) => (
                  <button key={m.id} style={cellBtn} onClick={() => onFocusNode(m.id)} title={m.file}>· {m.text}</button>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === 'query' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input placeholder="text contains…" value={queryText} onChange={(e) => setQueryText(e.target.value)} style={{ padding: 5, border: '1px solid #d1d5db', borderRadius: 5 }} />
            <input placeholder="min usage" value={minUsage} onChange={(e) => setMinUsage(e.target.value.replace(/\D/g, ''))} style={{ padding: 5, border: '1px solid #d1d5db', borderRadius: 5 }} />
            <select value={keywordType} onChange={(e) => setKeywordType(e.target.value as StepKeywordType | '')} style={{ padding: 5, border: '1px solid #d1d5db', borderRadius: 5 }}>
              <option value="">any keyword type</option>
              <option value="Context">Context (Given)</option>
              <option value="Action">Action (When)</option>
              <option value="Outcome">Outcome (Then)</option>
            </select>
            <label style={{ fontSize: 11 }}><input type="checkbox" checked={unmatchedOnly} onChange={(e) => setUnmatchedOnly(e.target.checked)} /> unmatched glue only</label>
            <button onClick={runQuery} style={{ padding: 6, borderRadius: 5, border: '1px solid #4c1d95', background: '#4c1d95', color: 'white', cursor: 'pointer' }}>Run query</button>
            {queryRows && queryRows.map((r) => (
              <button key={r.id} style={cellBtn} onClick={() => onFocusNode(r.id)} title={r.file}>{r.label} <span style={{ color: '#94a3b8' }}>×{r.usage}</span></button>
            ))}
          </div>
        )}

        {tab === 'refactor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ color: '#64748b', fontSize: 11 }}>Select a step node, then rename it across every file that uses it.</p>
            <div style={{ fontSize: 11 }}>Selected: <b>{selectedNodeId && nodeKind(selectedNodeId) === 'step' ? graph.nodes.find(n => n.id === selectedNodeId)?.data.text : '— none —'}</b></div>
            <input placeholder="new step text" value={newText} onChange={(e) => setNewText(e.target.value)} style={{ padding: 5, border: '1px solid #d1d5db', borderRadius: 5 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={doPreview} disabled={!newText} style={{ flex: 1, padding: 6, borderRadius: 5, border: '1px solid #d1d5db', background: '#f8fafc', cursor: 'pointer' }}>Preview</button>
              <button onClick={doApply} disabled={!preview} style={{ flex: 1, padding: 6, borderRadius: 5, border: '1px solid #166534', background: preview ? '#dcfce7' : '#f3f4f6', color: '#166534', cursor: preview ? 'pointer' : 'not-allowed' }}>Apply</button>
            </div>
            {preview && (
              <div>
                <p style={{ fontSize: 11, color: '#475569' }}>{preview.description} — {preview.affectedScenarioCount} occurrence(s), {preview.edits.length} file(s)</p>
                {preview.edits.map((e) => (
                  <pre key={e.file} style={{ background: '#0f172a', color: '#e2e8f0', fontSize: 10, padding: 6, borderRadius: 5, overflowX: 'auto', maxHeight: 160 }}>{e.file.split('/').pop()}
{diffLines(e.before, e.after)}</pre>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {aiStatus && !aiStatus.configured && (
              <p style={{ color: '#b45309', fontSize: 11 }}>
                No model configured. Set <code>AI_BASE_URL</code> and <code>AI_MODEL</code> (and <code>AI_API_KEY</code> for hosted providers) in the server environment — any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, OpenAI) works.
              </p>
            )}
            {aiStatus && aiStatus.configured && (
              <div style={{ fontSize: 10, color: '#64748b' }}>Model: <b>{aiStatus.model}</b> · grounded on the graph{selectedNodeId ? ' + selected node' : ''}</div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <button disabled={!selectedNodeId || aiStreaming} onClick={() => sendAi('Explain the selected node and its blast radius in plain language.')} style={quickBtn}>Explain selected</button>
              <button disabled={aiStreaming} onClick={() => sendAi('Review the suite health report and list the three most important issues to fix first, with why.')} style={quickBtn}>Top health issues</button>
              <button disabled={aiStreaming} onClick={() => sendAi('Find steps with no matching step definition and write step-definition stubs for them in JavaScript using @cucumber/cucumber. Do not claim they were applied.')} style={quickBtn}>Glue for unmatched</button>
              <button disabled={aiStreaming} onClick={() => sendAi('Suggest missing edge-case scenarios based on the existing features. Reference concrete feature names.')} style={quickBtn}>Edge cases</button>
            </div>

            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 6, background: '#fafafa' }}>
              {aiMessages.length === 0 && !aiStreaming && <p style={{ color: '#94a3b8', fontSize: 11 }}>Ask about impact, coverage, duplicates, or fixes. The model calls graph tools for exact answers.</p>}
              {aiMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: m.role === 'user' ? '#4c1d95' : '#0f766e', textTransform: 'uppercase' }}>{m.role}</div>
                  <div style={{ fontSize: 11, whiteSpace: 'pre-wrap', color: '#334155' }}>{m.content}</div>
                </div>
              ))}
              {aiTools.length > 0 && aiStreaming && (
                <div style={{ fontSize: 10, color: '#0369a1' }}>⚙ called: {aiTools.join(', ')}</div>
              )}
              {aiStreaming && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#0f766e', textTransform: 'uppercase' }}>assistant</div>
                  <div style={{ fontSize: 11, whiteSpace: 'pre-wrap', color: '#334155' }}>{aiPartial || '…'}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendAi(aiInput); }}
                placeholder="Ask about the suite…"
                disabled={aiStreaming || (aiStatus ? !aiStatus.configured : false)}
                style={{ flex: 1, padding: 5, border: '1px solid #d1d5db', borderRadius: 5 }}
              />
              {aiStreaming ? (
                <button onClick={() => { aiAbortRef.current?.(); setAiStreaming(false); }} style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid #dc2626', background: '#fee2e2', color: '#dc2626', cursor: 'pointer' }}>Stop</button>
              ) : (
                <button onClick={() => sendAi(aiInput)} disabled={!aiInput.trim()} style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid #4c1d95', background: '#4c1d95', color: 'white', cursor: 'pointer' }}>Send</button>
              )}
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div>
            <button onClick={loadHistory} style={{ ...cellBtn, color: '#4c1d95', fontWeight: 600 }}>↻ Refresh</button>
            {history && history.length === 0 && <p style={{ color: '#64748b' }}>No git history for this directory.</p>}
            {history && history.slice().reverse().map((d, i) => (
              <div key={i} style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{d.to.shortCommit} {d.to.subject}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  {fmtDelta('scenarios', d.scenarioDelta)} · {fmtDelta('features', d.featureDelta)} · {fmtDelta('steps', d.stepDelta)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function fmtDelta(label: string, delta: number): string {
  const sign = delta > 0 ? `+${delta}` : `${delta}`;
  return `${sign} ${label}`;
}

/** Minimal line diff for the preview panel. */
function diffLines(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const max = Math.max(a.length, b.length);
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) out.push(`- ${a[i]}`);
    if (b[i] !== undefined) out.push(`+ ${b[i]}`);
  }
  return out.join('\n');
}
