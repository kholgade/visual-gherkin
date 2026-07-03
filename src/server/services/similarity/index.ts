/**
 * Step normalization and near-duplicate clustering.
 * Turns concrete step text into a parameterized template so that steps which
 * differ only by literal values (numbers, quoted strings, outline placeholders)
 * are recognized as the same shape.
 */

const QUOTED = /"[^"]*"|'[^']*'/g;
const OUTLINE_PLACEHOLDER = /<[^>]+>/g;
const NUMBER = /\b\d+(?:\.\d+)?\b/g;
const WHITESPACE = /\s+/g;

/** Exact key: identical steps (same keyword classification + text). */
export function exactStepKey(keywordType: string, text: string): string {
  return `${keywordType}::${text.toLowerCase().trim()}`;
}

/**
 * Parameterized template: collapses literal values so
 * `I have 5 "red" apples` and `I have 12 "green" apples` share one template.
 */
export function templateKey(keywordType: string, text: string): string {
  const normalized = text
    .replace(QUOTED, '{string}')
    .replace(OUTLINE_PLACEHOLDER, '{param}')
    .replace(NUMBER, '{int}')
    .replace(WHITESPACE, ' ')
    .trim()
    .toLowerCase();
  return `${keywordType}::${normalized}`;
}

/** Human-readable template text (without the keyword prefix). */
export function templateText(text: string): string {
  return text
    .replace(QUOTED, '{string}')
    .replace(OUTLINE_PLACEHOLDER, '{param}')
    .replace(NUMBER, '{int}')
    .replace(WHITESPACE, ' ')
    .trim();
}
