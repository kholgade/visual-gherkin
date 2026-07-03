/**
 * Gherkin parser service
 * Parses .feature files into a normalized model using the official
 * @cucumber/gherkin AST. Supports Rules, Scenario Outlines, Examples tables,
 * data tables, doc strings, and tags at every level.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import {
  ParsedFeature,
  GherkinScenario,
  GherkinStep,
  ExampleTable,
  StepKeywordType,
} from '../../../shared/types';

function newParser(): Parser<any> {
  return new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
}

/** Map a Cucumber messages keywordType onto our classification. */
function classifyKeywordType(
  keywordType: string | undefined,
  previous: StepKeywordType
): StepKeywordType {
  switch (keywordType) {
    case 'Context':
      return 'Context';
    case 'Action':
      return 'Action';
    case 'Outcome':
      return 'Outcome';
    case 'Conjunction':
      return previous === 'Unknown' ? 'Conjunction' : previous;
    default:
      return 'Unknown';
  }
}

function tableToRows(table: any): string[][] {
  if (!table || !Array.isArray(table.rows)) return [];
  return table.rows.map((row: any) => row.cells.map((cell: any) => cell.value));
}

function convertSteps(rawSteps: any[]): GherkinStep[] {
  const steps: GherkinStep[] = [];
  let previousType: StepKeywordType = 'Unknown';

  for (const raw of rawSteps) {
    const keywordType = classifyKeywordType(raw.keywordType, previousType);
    if (keywordType !== 'Conjunction' && keywordType !== 'Unknown') {
      previousType = keywordType;
    }

    const step: GherkinStep = {
      type: (raw.keyword || '').trim(),
      keywordType,
      text: (raw.text || '').trim(),
      line: raw.location?.line ?? 0,
    };

    if (raw.dataTable) {
      step.dataTable = tableToRows(raw.dataTable);
    }
    if (raw.docString) {
      step.docString = raw.docString.content ?? '';
    }

    steps.push(step);
  }

  return steps;
}

function convertExamples(rawExamples: any[]): ExampleTable[] {
  if (!Array.isArray(rawExamples)) return [];
  return rawExamples.map((ex) => {
    const header: string[] = ex.tableHeader
      ? ex.tableHeader.cells.map((c: any) => c.value)
      : [];
    const rows: string[][] = Array.isArray(ex.tableBody)
      ? ex.tableBody.map((r: any) => r.cells.map((c: any) => c.value))
      : [];
    return {
      name: (ex.name || '').trim(),
      tags: (ex.tags || []).map((t: any) => t.name),
      header,
      rows,
      line: ex.location?.line ?? 0,
    };
  });
}

function convertScenario(raw: any, ruleName?: string): GherkinScenario {
  return {
    name: (raw.name || '').trim(),
    steps: convertSteps(raw.steps || []),
    line: raw.location?.line ?? 0,
    tags: (raw.tags || []).map((t: any) => t.name),
    examples: convertExamples(raw.examples || []),
    rule: ruleName,
  };
}

/**
 * Parse feature content (already read from disk or a git object) into the model.
 * The virtual path is recorded as the feature's file.
 */
export function parseFeatureContent(content: string, virtualPath: string): ParsedFeature | null {
  const document = newParser().parse(content);
  const feature = document.feature;
  if (!feature) {
    return null;
  }

  const scenarios: GherkinScenario[] = [];
  let background: GherkinStep[] = [];
  let backgroundLine = 0;

  const consumeChild = (child: any, ruleName?: string) => {
    if (child.background) {
      background = convertSteps(child.background.steps || []);
      backgroundLine = child.background.location?.line ?? 0;
    } else if (child.scenario) {
      scenarios.push(convertScenario(child.scenario, ruleName));
    }
  };

  for (const child of feature.children || []) {
    if (child.rule) {
      const ruleName = (child.rule.name || '').trim();
      for (const ruleChild of child.rule.children || []) {
        consumeChild(ruleChild, ruleName);
      }
    } else {
      consumeChild(child);
    }
  }

  if (scenarios.length === 0 && background.length === 0) {
    return null;
  }

  return {
    file: virtualPath,
    feature: (feature.name || '').trim(),
    description: (feature.description || '').trim(),
    language: feature.language || 'en',
    tags: (feature.tags || []).map((t: any) => t.name),
    background,
    backgroundLine,
    scenarios,
    line: feature.location?.line ?? 0,
  };
}

/**
 * Parse a single .feature file from disk.
 */
export function parseFeatureFile(filePath: string): ParsedFeature | null {
  return parseFeatureContent(fs.readFileSync(filePath, 'utf-8'), filePath);
}

function listFeatureFiles(dirPath: string): string[] {
  const result: string[] = [];
  const entries = fs.readdirSync(dirPath, { recursive: true }) as string[];
  for (const entry of entries) {
    const filePath = path.join(dirPath, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (stat.isFile() && filePath.endsWith('.feature')) {
      result.push(filePath);
    }
  }
  return result;
}

/**
 * Parse all .feature files in a directory (recursive).
 */
export function parseDirectory(dirPath: string): ParsedFeature[] {
  const features: ParsedFeature[] = [];
  for (const filePath of listFeatureFiles(dirPath)) {
    const parsed = parseFeatureFile(filePath);
    if (parsed) {
      features.push(parsed);
    }
  }
  return features;
}

/** Calculate content hash of a file for delta detection. */
export function getFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('md5').update(content).digest('hex');
}

/** Get hashes of all .feature files in directory. */
export function getDirectoryHashes(dirPath: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const filePath of listFeatureFiles(dirPath)) {
    hashes[filePath] = getFileHash(filePath);
  }
  return hashes;
}
