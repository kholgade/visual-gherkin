/**
 * Graph-aware refactors (write path).
 * Produces file edits with before/after content so the caller can preview the
 * blast radius before applying. Edits are line-precise, driven by the AST line
 * numbers captured during parsing.
 */

import fs from 'fs';
import {
  ParsedFeature,
  RefactorRequest,
  RefactorPreview,
  FileEdit,
  GherkinStep,
} from '../../../shared/types';
import { GraphStore } from '../../graph/store';
import { exactStepKey } from '../similarity';

const STEP_LINE = /^(\s*)(Given|When|Then|And|But|\*)(\s+)(.*)$/;

interface StepLocation {
  file: string;
  line: number;
  text: string;
  keywordType: string;
}

/** Every place a step is authored, resolved from the parsed model. */
function locateSteps(features: ParsedFeature[]): StepLocation[] {
  const locations: StepLocation[] = [];
  const push = (file: string, step: GherkinStep) =>
    locations.push({ file, line: step.line, text: step.text, keywordType: step.keywordType });
  for (const feature of features) {
    for (const step of feature.background) push(feature.file, step);
    for (const scenario of feature.scenarios) {
      for (const step of scenario.steps) push(feature.file, step);
    }
  }
  return locations;
}

function resolveStep(store: GraphStore, stepId: string): { keywordType: string; text: string } {
  const node = store.getNode(stepId);
  if (!node || node.kind !== 'step') {
    throw new Error(`Step node not found: ${stepId}`);
  }
  return { keywordType: node.props.keywordType, text: node.label };
}

/** Rewrite the text portion of a step line, preserving keyword and indentation. */
function rewriteLine(rawLine: string, newText: string): string {
  const m = rawLine.match(STEP_LINE);
  if (!m) return rawLine;
  return `${m[1]}${m[2]}${m[3]}${newText}`;
}

interface FileMutation {
  lines: string[];
  changed: boolean;
}

function loadFiles(files: Set<string>): Map<string, FileMutation> {
  const map = new Map<string, FileMutation>();
  for (const file of files) {
    map.set(file, { lines: fs.readFileSync(file, 'utf-8').split('\n'), changed: false });
  }
  return map;
}

function toEdits(originals: Map<string, string>, mutated: Map<string, FileMutation>): FileEdit[] {
  const edits: FileEdit[] = [];
  for (const [file, mutation] of mutated) {
    if (!mutation.changed) continue;
    edits.push({ file, before: originals.get(file)!, after: mutation.lines.join('\n') });
  }
  return edits;
}

/**
 * Build a preview for a refactor request without touching disk.
 */
export function previewRefactor(
  features: ParsedFeature[],
  store: GraphStore,
  req: RefactorRequest
): RefactorPreview {
  const locations = locateSteps(features);

  if (req.kind === 'rename-step' || req.kind === 'merge-steps') {
    if (!req.stepId || !req.newText) {
      throw new Error('rename/merge requires stepId and newText');
    }
    const targets = [req.stepId, ...(req.mergeIds ?? [])].map((id) => resolveStep(store, id));
    const targetKeys = new Set(targets.map((t) => exactStepKey(t.keywordType, t.text)));

    const affected = locations.filter((loc) =>
      targetKeys.has(exactStepKey(loc.keywordType, loc.text))
    );
    const files = new Set(affected.map((a) => a.file));
    const originals = new Map<string, string>();
    for (const file of files) originals.set(file, fs.readFileSync(file, 'utf-8'));
    const mutated = loadFiles(files);

    for (const loc of affected) {
      const mutation = mutated.get(loc.file)!;
      const idx = loc.line - 1;
      const rewritten = rewriteLine(mutation.lines[idx], req.newText);
      if (rewritten !== mutation.lines[idx]) {
        mutation.lines[idx] = rewritten;
        mutation.changed = true;
      }
    }

    return {
      edits: toEdits(originals, mutated),
      affectedScenarioCount: new Set(affected.map((a) => `${a.file}:${a.line}`)).size,
      description:
        req.kind === 'rename-step'
          ? `Rename step to "${req.newText}" across ${files.size} file(s)`
          : `Merge ${targets.length} step variants into "${req.newText}"`,
    };
  }

  if (req.kind === 'extract-background') {
    if (!req.featureId || !req.extractStepIds || req.extractStepIds.length === 0) {
      throw new Error('extract-background requires featureId and extractStepIds');
    }
    const featureNode = store.getNode(req.featureId);
    if (!featureNode || featureNode.kind !== 'feature') {
      throw new Error(`Feature node not found: ${req.featureId}`);
    }
    const feature = features.find((f) => f.file === featureNode.file);
    if (!feature) {
      throw new Error(`Feature not loaded: ${featureNode.file}`);
    }

    const extractSteps = req.extractStepIds.map((id) => resolveStep(store, id));
    const extractKeys = new Set(extractSteps.map((s) => exactStepKey(s.keywordType, s.text)));

    const originals = new Map<string, string>([[feature.file, fs.readFileSync(feature.file, 'utf-8')]]);
    const original = originals.get(feature.file)!;
    const lines = original.split('\n');

    // Lines (1-based) to remove: matching steps inside every scenario.
    const removeLines = new Set<number>();
    for (const scenario of feature.scenarios) {
      for (const step of scenario.steps) {
        if (extractKeys.has(exactStepKey(step.keywordType, step.text))) {
          removeLines.add(step.line);
        }
      }
    }

    // Determine indentation and the Background insertion point.
    const sampleStepLine = feature.scenarios[0]?.steps[0]?.line ?? feature.line + 1;
    const stepIndentMatch = lines[sampleStepLine - 1]?.match(/^(\s*)/);
    const stepIndent = stepIndentMatch ? stepIndentMatch[1] : '    ';
    const sectionIndent = stepIndent.slice(0, Math.max(0, stepIndent.length - 2)) || '  ';

    const backgroundBlock: string[] = [];
    const hasExistingBackground = feature.background.length > 0;
    if (!hasExistingBackground) {
      backgroundBlock.push(`${sectionIndent}Background:`);
    }
    for (const step of extractSteps) {
      backgroundBlock.push(`${stepIndent}${keywordFor(step.keywordType)} ${step.text}`);
    }

    const out: string[] = [];
    let inserted = false;
    const insertBeforeLine = hasExistingBackground
      ? feature.background[feature.background.length - 1].line + 1
      : firstScenarioOrTagLine(feature);

    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      if (lineNo === insertBeforeLine && !inserted) {
        out.push(...backgroundBlock);
        inserted = true;
      }
      if (!removeLines.has(lineNo)) {
        out.push(lines[i]);
      }
    }
    if (!inserted) {
      out.push(...backgroundBlock);
    }

    return {
      edits: [{ file: feature.file, before: original, after: out.join('\n') }],
      affectedScenarioCount: feature.scenarios.length,
      description: `Extract ${extractSteps.length} step(s) into Background of "${feature.feature}"`,
    };
  }

  throw new Error(`Unknown refactor kind: ${(req as RefactorRequest).kind}`);
}

function keywordFor(keywordType: string): string {
  switch (keywordType) {
    case 'Context':
      return 'Given';
    case 'Action':
      return 'When';
    case 'Outcome':
      return 'Then';
    default:
      return 'And';
  }
}

function firstScenarioOrTagLine(feature: ParsedFeature): number {
  const first = feature.scenarios[0];
  if (!first) return feature.line + 1;
  // Insert before the scenario's tags if any precede it; tags sit directly above.
  return first.line;
}

/** Apply the edits from a preview to disk. Returns the applied edits. */
export function applyRefactor(
  features: ParsedFeature[],
  store: GraphStore,
  req: RefactorRequest
): FileEdit[] {
  const preview = previewRefactor(features, store, req);
  for (const edit of preview.edits) {
    fs.writeFileSync(edit.file, edit.after, 'utf-8');
  }
  return preview.edits;
}
