/**
 * LLM provider configuration.
 * Resolves an OpenAI-compatible endpoint from environment variables, with
 * optional non-secret per-request overrides for base URL and model. The API
 * key is only ever read from the environment so it never travels through the
 * browser.
 */

export interface AiConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface AiOverrides {
  baseURL?: string;
  model?: string;
}

function envValue(name: string): string {
  const value = process.env[name];
  return value ? value.trim() : '';
}

/** True when the environment supplies at least a base URL and a model. */
export function isConfigured(): boolean {
  return envValue('AI_BASE_URL') !== '' && envValue('AI_MODEL') !== '';
}

export function statusModel(): string {
  return envValue('AI_MODEL');
}

export function statusBaseURL(): string {
  return envValue('AI_BASE_URL');
}

/**
 * Resolve the effective configuration. Throws when the base URL or model is
 * absent so the caller surfaces a clear error rather than guessing a provider.
 */
export function resolveConfig(overrides: AiOverrides = {}): AiConfig {
  const baseURL = (overrides.baseURL ?? envValue('AI_BASE_URL')).replace(/\/+$/, '');
  const model = overrides.model ?? envValue('AI_MODEL');
  const apiKey = envValue('AI_API_KEY');

  if (!baseURL) {
    throw new Error('AI_BASE_URL is not configured');
  }
  if (!model) {
    throw new Error('AI_MODEL is not configured');
  }
  return { baseURL, apiKey, model };
}
