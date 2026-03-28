/**
 * LLM Call Retry Utility
 *
 * Provides retry with exponential backoff, timeout protection,
 * and model fallback for all LLM calls in the application.
 *
 * Replaces raw `openai.chat.completions.create()` calls that had
 * no retry, no timeout, and no fallback behavior.
 */

import OpenAI from 'openai'
import { getOpenAIClient } from './openai-client'
import { getAnthropicClient } from './anthropic-client'
import { AI_MODELS } from './models'
import { logger } from '@/lib/utils/logger'

export interface LLMCallOptions {
  /** Chat messages to send */
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
  /** Model to use (defaults to AI_MODELS.planning) */
  model?: string
  /** Temperature (0-2, defaults to 0.3) */
  temperature?: number
  /** Max tokens for response */
  maxTokens?: number
  /** Request JSON output */
  jsonMode?: boolean
  /** Timeout in ms (defaults to 30000) */
  timeoutMs?: number
  /** Max retry attempts (defaults to 2) */
  maxRetries?: number
  /** Fallback model if primary fails (defaults to AI_MODELS.fast) */
  fallbackModel?: string | null
  /** Label for logging */
  label?: string
}

export interface LLMCallResult {
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  retryCount: number
}

/**
 * Call an LLM with retry, timeout, and model fallback.
 *
 * Behavior:
 * 1. Try primary model up to maxRetries times with exponential backoff
 * 2. If all retries fail and fallbackModel is set, try fallback once
 * 3. Throws if everything fails
 */
export async function callLLMWithRetry(options: LLMCallOptions): Promise<LLMCallResult> {
  const {
    messages,
    model = AI_MODELS.planning,
    temperature = 0.3,
    maxTokens = 2000,
    jsonMode = false,
    timeoutMs = 30000,
    maxRetries = 2,
    fallbackModel = AI_MODELS.fast,
    label = 'LLM',
  } = options

  const client = getOpenAIClient()
  let lastError: Error | null = null

  // Try primary model with retries
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callWithTimeout(client, {
        model,
        messages,
        temperature,
        maxTokens,
        jsonMode,
        timeoutMs,
      })

      if (attempt > 0) {
        logger.info(`[${label}] Succeeded on retry ${attempt}`, { model })
      }

      return { ...result, model, retryCount: attempt }
    } catch (error: any) {
      lastError = error
      const isRetryable = isRetryableError(error)

      logger.warn(`[${label}] Attempt ${attempt + 1}/${maxRetries + 1} failed`, {
        model,
        error: error?.message || String(error),
        status: error?.status,
        isRetryable,
      })

      if (!isRetryable || attempt === maxRetries) {
        break
      }

      // Exponential backoff: 1s, 2s, 4s...
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
      await sleep(delay)
    }
  }

  // Try fallback model if different from primary
  if (fallbackModel && fallbackModel !== model) {
    try {
      logger.info(`[${label}] Trying fallback model`, { fallbackModel, primaryModel: model })

      const result = await callWithTimeout(client, {
        model: fallbackModel,
        messages,
        temperature,
        maxTokens,
        jsonMode,
        timeoutMs,
      })

      return { ...result, model: fallbackModel, retryCount: maxRetries + 1 }
    } catch (fallbackError: any) {
      logger.error(`[${label}] Fallback model also failed`, {
        fallbackModel,
        error: fallbackError?.message || String(fallbackError),
      })
    }
  }

  throw lastError || new Error(`[${label}] All LLM call attempts failed`)
}

/**
 * Parse JSON from an LLM response, with error context.
 */
export function parseLLMJson<T = any>(content: string, label = 'LLM'): T {
  try {
    return JSON.parse(content)
  } catch (error) {
    logger.error(`[${label}] Failed to parse JSON response`, {
      contentPreview: content?.substring(0, 200),
    })
    throw new Error(`[${label}] Invalid JSON in LLM response`)
  }
}

// ============================================================================
// INTERNALS
// ============================================================================

async function callWithTimeout(
  client: OpenAI,
  options: {
    model: string
    messages: OpenAI.Chat.ChatCompletionMessageParam[]
    temperature: number
    maxTokens: number
    jsonMode: boolean
    timeoutMs: number
  }
): Promise<Omit<LLMCallResult, 'model' | 'retryCount'>> {
  const { model, messages, temperature, maxTokens, jsonMode, timeoutMs } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode && { response_format: { type: 'json_object' as const } }),
      },
      { signal: controller.signal }
    )

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Empty response from LLM')
    }

    return {
      content,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

function isRetryableError(error: any): boolean {
  // Rate limit (429)
  if (error?.status === 429) return true
  // Server errors (500, 502, 503)
  if (error?.status >= 500 && error?.status < 600) return true
  // Timeout
  if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') return true
  // Network errors
  if (error?.code === 'ECONNRESET' || error?.code === 'ECONNREFUSED') return true
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// ANTHROPIC SDK SUPPORT
// ============================================================================

export interface AnthropicCallOptions {
  /** Chat messages to send */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  /** System prompt */
  system?: string
  /** Model to use (defaults to AI_MODELS.anthropic.fast) */
  model?: string
  /** Max tokens for response */
  maxTokens?: number
  /** Temperature (0-1, defaults to 0.7) */
  temperature?: number
  /** Timeout in ms (defaults to 15000 — shorter for fast tasks) */
  timeoutMs?: number
  /** Max retry attempts (defaults to 2) */
  maxRetries?: number
  /** Label for logging */
  label?: string
}

export interface AnthropicCallResult {
  content: string
  model: string
  usage?: { inputTokens: number; outputTokens: number }
  retryCount: number
}

/**
 * Call an Anthropic model with retry, timeout, and structured logging.
 *
 * Same retry/backoff pattern as callLLMWithRetry, adapted for the Anthropic SDK.
 * No model fallback (Haiku is already the cheapest tier).
 */
export async function callAnthropicWithRetry(
  options: AnthropicCallOptions
): Promise<AnthropicCallResult> {
  const {
    messages,
    system,
    model = AI_MODELS.anthropic.fast,
    maxTokens = 300,
    temperature = 0.7,
    timeoutMs = 15000,
    maxRetries = 2,
    label = 'Anthropic',
  } = options

  const client = getAnthropicClient()
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await client.messages.create(
          {
            model,
            max_tokens: maxTokens,
            temperature,
            messages,
            ...(system && { system }),
          },
          { signal: controller.signal as any }
        )

        if (attempt > 0) {
          logger.info(`[${label}] Succeeded on retry ${attempt}`, { model })
        }

        const content =
          response.content[0]?.type === 'text'
            ? response.content[0].text.trim()
            : ''

        if (!content) {
          throw new Error('Empty response from Anthropic')
        }

        return {
          content,
          model,
          usage: response.usage
            ? {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
              }
            : undefined,
          retryCount: attempt,
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error: any) {
      lastError = error

      const retryable = isRetryableError(error)

      logger.warn(`[${label}] Attempt ${attempt + 1}/${maxRetries + 1} failed`, {
        model,
        error: error?.message || String(error),
        status: error?.status,
        isRetryable: retryable,
      })

      if (!retryable || attempt === maxRetries) {
        break
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
      await sleep(delay)
    }
  }

  throw lastError || new Error(`[${label}] All Anthropic call attempts failed`)
}
