/**
 * Shared OpenAI Client
 *
 * Single lazy-initialized OpenAI client instance for the entire application.
 * Replaces scattered `let _openai: OpenAI | null = null` patterns across
 * llmPlanner.ts, planner.ts, stream-workflow/route.ts, and other AI routes.
 */

import OpenAI from 'openai'

let _client: OpenAI | null = null

/**
 * Returns a shared OpenAI client instance.
 * Lazily initializes on first call using OPENAI_API_KEY from environment.
 */
export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    _client = new OpenAI({ apiKey })
  }
  return _client
}

/**
 * Returns an OpenAI client with a custom API key.
 * Used for user-provided keys (e.g., in AI agent actions).
 * Does NOT cache — each call creates a new instance.
 */
export function getOpenAIClientWithKey(apiKey: string): OpenAI {
  return new OpenAI({ apiKey })
}

/**
 * Resets the shared client (for testing purposes only).
 */
export function resetOpenAIClient(): void {
  _client = null
}
