/**
 * Token-Aware Conversation History Utilities
 *
 * Provides token-budget-aware truncation of conversation history
 * instead of naive `.slice(-5)` which doesn't account for message length.
 *
 * Also provides conversation summarization using a cheap LLM model
 * to preserve context in long conversations without excessive token usage.
 */

import { callLLMWithRetry } from './llm-retry'
import { AI_MODELS } from './models'
import { logger } from '@/lib/utils/logger'

/**
 * Rough token estimation: ~4 chars per token for English text.
 * This is a fast approximation ��� exact counting would require tiktoken.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

interface ConversationMessage {
  role: string
  content: string
}

export interface SummarizationResult {
  /** Summary of older messages (null if not summarized) */
  summary: string | null
  /** Recent messages kept in full */
  recentMessages: ConversationMessage[]
  /** Whether summarization was performed */
  wasSummarized: boolean
}

/**
 * Summarize older conversation messages using a cheap LLM model,
 * keeping the most recent messages in full for immediate context.
 *
 * Falls back to truncation if summarization fails.
 *
 * @param messages - Full conversation history
 * @param options.recentMessageCount - How many recent messages to keep in full (default: 3)
 * @param options.cachedSummary - Previously generated summary to reuse
 * @param options.cachedMessageCount - Number of messages when cached summary was generated
 */
export async function summarizeConversation(
  messages: ConversationMessage[],
  options?: {
    recentMessageCount?: number
    cachedSummary?: string
    cachedMessageCount?: number
  }
): Promise<SummarizationResult> {
  const recentCount = options?.recentMessageCount ?? 3

  // Short conversations don't need summarization
  if (!messages || messages.length <= recentCount + 1) {
    return { summary: null, recentMessages: messages || [], wasSummarized: false }
  }

  const recentMessages = messages.slice(-recentCount)
  const olderMessages = messages.slice(0, -recentCount)

  // Reuse cached summary if conversation hasn't grown much
  if (options?.cachedSummary && options?.cachedMessageCount) {
    const growth = messages.length - options.cachedMessageCount
    if (growth < 2) {
      return { summary: options.cachedSummary, recentMessages, wasSummarized: true }
    }
  }

  try {
    const historyText = olderMessages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')

    const result = await callLLMWithRetry({
      messages: [
        {
          role: 'system',
          content: 'Summarize this workflow building conversation in 2-3 sentences. Preserve: what the user wants to build, what has been built so far, and any preferences or constraints expressed. Be concise.',
        },
        {
          role: 'user',
          content: historyText,
        },
      ],
      model: AI_MODELS.fast,
      temperature: 0.1,
      maxTokens: 200,
      timeoutMs: 10000,
      maxRetries: 1,
      fallbackModel: null,
      label: 'ConversationSummarizer',
    })

    return {
      summary: result.content.trim(),
      recentMessages,
      wasSummarized: true,
    }
  } catch (error) {
    logger.warn('[summarizeConversation] Failed, falling back to truncation', {
      error: error instanceof Error ? error.message : String(error),
    })
    // Fallback: truncate older messages instead
    const truncated = truncateConversationHistory(messages, 1000)
    return { summary: null, recentMessages: truncated, wasSummarized: false }
  }
}

/**
 * Truncate conversation history to fit within a token budget.
 * Keeps the most recent messages that fit, preserving chronological order.
 *
 * @param messages - Full conversation history
 * @param maxTokens - Maximum token budget for the history (default: 1000)
 * @returns Truncated array of messages that fit within budget
 */
export function truncateConversationHistory(
  messages: ConversationMessage[],
  maxTokens: number = 1000
): ConversationMessage[] {
  if (!messages || messages.length === 0) return []

  // Work backwards from most recent, adding messages until budget is exhausted
  const result: ConversationMessage[] = []
  let tokenCount = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const msgTokens = estimateTokens(`${msg.role}: ${msg.content}`)

    if (tokenCount + msgTokens > maxTokens && result.length > 0) {
      break
    }

    result.unshift(msg)
    tokenCount += msgTokens
  }

  return result
}
