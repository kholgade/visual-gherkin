/**
 * Gherkin parser service
 * Parses .feature files and extracts scenarios, background steps, and steps
 */

import fs from 'fs';
import path from 'path';
import { ParsedFeature, GherkinScenario, GherkinStep } from '../../../shared/types';

/**
 * Simple gherkin parser using regex
 * Handles Feature, Background, Scenario, Scenario Outline, and step keywords
 */
function simpleParseFeature(content: string): {
  featureName: string;
  background: GherkinStep[];
  scenarios: GherkinScenario[];
} {
  const lines = content.split('\n');
  let featureName = 'Unnamed Feature';
  const scenarios: GherkinScenario[] = [];
  const background: GherkinStep[] = [];
  let currentScenario: GherkinScenario | null = null;
  let inBackground = false;
  let scenarioLine = 0;

  const featureRegex = /^Feature:\s*(.+)$/i;
  const backgroundRegex = /^Background:/i;
  const scenarioRegex = /^(?:Scenario|Scenario Outline):\s*(.+)$/i;
  const stepRegex = /^(Given|When|Then|And|But)\s+(.+)$/i;
  const tagRegex = /^(@\S+(?:\s+@\S+)*)$/;

  let pendingTags: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Collect tags for next scenario
    const tagMatch = trimmed.match(tagRegex);
    if (tagMatch) {
      pendingTags = pendingTags.concat(trimmed.split(/\s+/).filter((t) => t.startsWith('@')));
      continue;
    }

    const featureMatch = trimmed.match(featureRegex);
    if (featureMatch) {
      featureName = featureMatch[1].trim();
      pendingTags = [];
      continue;
    }

    const backgroundMatch = trimmed.match(backgroundRegex);
    if (backgroundMatch) {
      if (currentScenario && currentScenario.steps.length > 0) {
        scenarios.push(currentScenario);
        currentScenario = null;
      }
      inBackground = true;
      pendingTags = [];
      continue;
    }

    const scenarioMatch = trimmed.match(scenarioRegex);
    if (scenarioMatch) {
      if (currentScenario && currentScenario.steps.length > 0) {
        scenarios.push(currentScenario);
      }
      inBackground = false;
      scenarioLine = i + 1;
      currentScenario = {
        name: scenarioMatch[1].trim(),
        steps: [],
        line: scenarioLine,
        tags: pendingTags,
      };
      pendingTags = [];
      continue;
    }

    const stepMatch = trimmed.match(stepRegex);
    if (stepMatch) {
      const step: GherkinStep = {
        type: stepMatch[1] as GherkinStep['type'],
        text: stepMatch[2].trim(),
        line: i + 1,
      };

      if (inBackground) {
        background.push(step);
      } else if (currentScenario) {
        currentScenario.steps.push(step);
      }
    }
  }

  if (currentScenario && currentScenario.steps.length > 0) {
    scenarios.push(currentScenario);
  }

  return { featureName, background, scenarios };
}

/**
 * Parse a single .feature file
 * Returns structured feature data with background steps, scenarios, and steps
 */
export function parseFeatureFile(filePath: string): ParsedFeature | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = simpleParseFeature(content);

    if (parsed.scenarios.length === 0 && parsed.background.length === 0) {
      return null;
    }

    return {
      file: filePath,
      feature: parsed.featureName,
      background: parsed.background,
      scenarios: parsed.scenarios as GherkinScenario[],
    };
  } catch (error) {
    console.error(`Error parsing feature file ${filePath}:`, error);
    return null;
  }
}

/**
 * Parse all .feature files in a directory
 * Returns array of parsed features
 */
export function parseDirectory(dirPath: string): ParsedFeature[] {
  const features: ParsedFeature[] = [];

  try {
    const files = fs.readdirSync(dirPath, { recursive: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file as string);
      const stat = fs.statSync(filePath);

      if (stat.isFile() && filePath.endsWith('.feature')) {
        const parsed = parseFeatureFile(filePath);
        if (parsed) {
          features.push(parsed);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return features;
}

/**
 * Calculate hash of a file for delta detection
 */
export function getFileHash(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Get hashes of all .feature files in directory
 */
export function getDirectoryHashes(dirPath: string): Record<string, string> {
  const hashes: Record<string, string> = {};

  try {
    const files = fs.readdirSync(dirPath, { recursive: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file as string);
      const stat = fs.statSync(filePath);

      if (stat.isFile() && filePath.endsWith('.feature')) {
        hashes[filePath] = getFileHash(filePath);
      }
    }
  } catch (error) {
    console.error(`Error getting hashes for directory ${dirPath}:`, error);
  }

  return hashes;
}
