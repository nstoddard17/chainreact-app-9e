/**
 * Token-Aware Conversation History Utilities
 *
 * Provides token-budget-aware truncation of conversation history
 * instead of naive `.slice(-5)` which doesn't account for message length.
 */

/**
 * Rough token estimation: ~4 chars per token for English text.
 * This is a fast approximation — exact counting would require tiktoken.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

interface ConversationMessage {
  role: string
  content: string
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
