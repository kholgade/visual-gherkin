/**
 * Git history analysis.
 * Walks recent commits that touched the loaded feature directory, parses the
 * .feature files as they existed at each commit, and reports how the suite's
 * structure evolved.
 */

import { execFileSync } from 'child_process';
import path from 'path';
import { parseFeatureContent } from '../parser';
import { HistorySnapshot, HistoryDiffEntry } from '../../../shared/types';

function git(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
}

function repoRootOf(dirPath: string): string {
  return git(dirPath, ['rev-parse', '--show-toplevel']).trim();
}

function relFromRepo(repoRoot: string, dirPath: string): string {
  const rel = path.relative(repoRoot, dirPath);
  return rel === '' ? '.' : rel;
}

function listFeatureFilesAt(repoRoot: string, commit: string, relDir: string): string[] {
  const out = git(repoRoot, ['ls-tree', '-r', '--name-only', commit, '--', relDir]).trim();
  if (!out) return [];
  return out.split('\n').filter((f) => f.endsWith('.feature'));
}

function fileAt(repoRoot: string, commit: string, filePath: string): string | null {
  try {
    return git(repoRoot, ['show', `${commit}:${filePath}`]);
  } catch {
    return null;
  }
}

function snapshotAt(
  repoRoot: string,
  commit: string,
  relDir: string,
  meta: { author: string; date: string; subject: string }
): HistorySnapshot {
  let featureCount = 0;
  let scenarioCount = 0;
  let stepUsageCount = 0;
  const uniqueSteps = new Set<string>();

  for (const filePath of listFeatureFilesAt(repoRoot, commit, relDir)) {
    const content = fileAt(repoRoot, commit, filePath);
    if (content === null) continue;
    const parsed = parseFeatureContent(content, filePath);
    if (!parsed) continue;
    featureCount++;
    for (const step of parsed.background) {
      uniqueSteps.add(`${step.keywordType}:${step.text.toLowerCase()}`);
      stepUsageCount++;
    }
    for (const scenario of parsed.scenarios) {
      scenarioCount++;
      for (const step of scenario.steps) {
        uniqueSteps.add(`${step.keywordType}:${step.text.toLowerCase()}`);
        stepUsageCount++;
      }
    }
  }

  return {
    commit,
    shortCommit: commit.slice(0, 8),
    author: meta.author,
    date: meta.date,
    subject: meta.subject,
    featureCount,
    scenarioCount,
    uniqueStepCount: uniqueSteps.size,
    stepUsageCount,
  };
}

/**
 * Build the history of the suite over the last `limit` commits that touched it.
 */
export function buildHistory(dirPath: string, limit: number): HistoryDiffEntry[] {
  const repoRoot = repoRootOf(dirPath);
  const relDir = relFromRepo(repoRoot, dirPath);

  const log = git(repoRoot, [
    'log',
    `-n`,
    String(limit),
    '--format=%H%x1f%an%x1f%aI%x1f%s',
    '--',
    relDir,
  ]).trim();

  if (!log) return [];

  const commits = log.split('\n').map((line) => {
    const [commit, author, date, subject] = line.split('\x1f');
    return { commit, author, date, subject };
  });

  // Oldest → newest so deltas read forward in time.
  const ordered = commits.slice().reverse();
  const snapshots = ordered.map((c) =>
    snapshotAt(repoRoot, c.commit, relDir, { author: c.author, date: c.date, subject: c.subject })
  );

  const diffs: HistoryDiffEntry[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const from = snapshots[i - 1];
    const to = snapshots[i];
    diffs.push({
      from,
      to,
      featureDelta: to.featureCount - from.featureCount,
      scenarioDelta: to.scenarioCount - from.scenarioCount,
      stepDelta: to.uniqueStepCount - from.uniqueStepCount,
    });
  }
  return diffs;
}
