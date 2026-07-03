/**
 * Step-definition (glue) scanner.
 * Discovers step definitions in JavaScript/TypeScript/Ruby (call form) and
 * Python/behave (decorator form) source, compiles each to a matching RegExp
 * via Cucumber Expressions, and matches Gherkin steps against them.
 */

import fs from 'fs';
import path from 'path';
import {
  ExpressionFactory,
  ParameterTypeRegistry,
} from '@cucumber/cucumber-expressions';
import { GlueDefinition, GherkinStep } from '../../../shared/types';

const GLUE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.rb', '.py']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__']);

/** call form: Given('...'), When("..."), Then(/regex/i), defineStep(...) */
const CALL_FORM =
  /\b(Given|When|Then|And|But|defineStep|Step)\s*\(\s*(\/(?:\\.|[^/\\\r\n])+\/[a-z]*|(['"`])(?:\\.|(?!\3)[^\\])*\3)/g;

/** decorator form: @given('...'), @when(u"..."), @then(r'...'), @step('...') */
const DECORATOR_FORM =
  /@(given|when|then|step)\s*\(\s*[a-z]{0,2}(['"])((?:\\.|(?!\2)[^\\])*)\2/gi;

const factory = new ExpressionFactory(new ParameterTypeRegistry());

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function compileRegexSource(rawExpression: string, isRegex: boolean): string | null {
  try {
    if (isRegex) {
      const lastSlash = rawExpression.lastIndexOf('/');
      const source = rawExpression.slice(1, lastSlash);
      // Validate it compiles as a RegExp.
      new RegExp(source);
      return source;
    }
    const expression = factory.createExpression(rawExpression) as unknown as { regexp: RegExp };
    return expression.regexp.source;
  } catch {
    return null;
  }
}

function extractFromContent(filePath: string, content: string): GlueDefinition[] {
  const defs: GlueDefinition[] = [];

  const pushDef = (
    keyword: string,
    literal: string,
    isRegex: boolean,
    innerExpression: string,
    index: number
  ) => {
    const regexSource = compileRegexSource(isRegex ? literal : innerExpression, isRegex);
    if (regexSource === null) return;
    defs.push({
      file: filePath,
      line: lineOf(content, index),
      keyword: keyword.toLowerCase(),
      expression: innerExpression,
      isRegex,
      regexSource,
    });
  };

  let match: RegExpExecArray | null;

  CALL_FORM.lastIndex = 0;
  while ((match = CALL_FORM.exec(content)) !== null) {
    const keyword = match[1];
    const literal = match[2];
    const isRegex = literal.startsWith('/');
    const inner = isRegex ? literal : literal.slice(1, -1);
    pushDef(keyword, literal, isRegex, inner, match.index);
  }

  DECORATOR_FORM.lastIndex = 0;
  while ((match = DECORATOR_FORM.exec(content)) !== null) {
    const keyword = match[1];
    const inner = match[3];
    // Python raw/regex strings are used as regular expressions by behave.
    pushDef(keyword, inner, false, inner, match.index);
  }

  return defs;
}

function listGlueFiles(dirPath: string): string[] {
  const result: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (GLUE_EXTENSIONS.has(path.extname(entry.name))) {
        result.push(path.join(dir, entry.name));
      }
    }
  };
  walk(dirPath);
  return result;
}

/** Scan a directory tree for step definitions. */
export function scanGlue(dirPath: string): GlueDefinition[] {
  const defs: GlueDefinition[] = [];
  for (const filePath of listGlueFiles(dirPath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    defs.push(...extractFromContent(filePath, content));
  }
  return defs;
}

/** Compile once and reuse for matching many steps. */
export interface CompiledGlue {
  def: GlueDefinition;
  regex: RegExp;
}

export function compileGlue(defs: GlueDefinition[]): CompiledGlue[] {
  const compiled: CompiledGlue[] = [];
  for (const def of defs) {
    try {
      compiled.push({ def, regex: new RegExp(`^${def.regexSource}$`) });
    } catch {
      // A definition whose source cannot be anchored is skipped rather than
      // matched loosely.
    }
  }
  return compiled;
}

/** Indices of definitions whose regex matches the step text. */
export function matchStep(step: GherkinStep, compiled: CompiledGlue[]): number[] {
  const matches: number[] = [];
  for (let i = 0; i < compiled.length; i++) {
    if (compiled[i].regex.test(step.text)) {
      matches.push(i);
    }
  }
  return matches;
}
