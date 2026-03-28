/**
 * Tests for state-based AI agent context:
 * - formatFlowStateForLLM (compact flow state for LLM)
 * - summarizeConversation (cheap model summarization)
 * - estimateTokens (token estimation utility)
 */

// Mock LLM calls at top level so jest.mock hoisting works
jest.mock('@/lib/ai/llm-retry', () => ({
  callLLMWithRetry: jest.fn(),
  parseLLMJson: jest.fn(),
}))

import { callLLMWithRetry } from '@/lib/ai/llm-retry'

const mockCallLLM = callLLMWithRetry as jest.MockedFunction<typeof callLLMWithRetry>

// ============================================================================
// formatFlowStateForLLM
// ============================================================================

describe('formatFlowStateForLLM', () => {
  let formatFlowStateForLLM: any

  beforeAll(async () => {
    const mod = await import('@/src/lib/workflows/builder/agent/llmPlanner')
    formatFlowStateForLLM = mod.formatFlowStateForLLM
  })

  it('returns empty workflow message for no nodes', () => {
    const result = formatFlowStateForLLM({ nodes: [], edges: [] })
    expect(result).toContain('Empty')
    expect(result).toContain('no nodes')
  })

  it('lists nodes with types and positions', () => {
    const result = formatFlowStateForLLM({
      nodes: [
        { id: 'n1', type: 'gmail_trigger_new_email', label: 'Gmail Trigger' },
        { id: 'n2', type: 'slack_action_send_message', label: 'Slack Send' },
      ],
      edges: [{ id: 'e1', from: { nodeId: 'n1' }, to: { nodeId: 'n2' } }],
    })

    expect(result).toContain('2 nodes')
    expect(result).toContain('gmail_trigger_new_email')
    expect(result).toContain('slack_action_send_message')
    expect(result).toContain('1.')
    expect(result).toContain('2.')
  })

  it('includes custom labels when different from type', () => {
    const result = formatFlowStateForLLM({
      nodes: [
        { id: 'n1', type: 'gmail_trigger', label: 'My Email Watcher' },
      ],
      edges: [],
    })

    expect(result).toContain('"My Email Watcher"')
  })

  it('omits label when same as type', () => {
    const result = formatFlowStateForLLM({
      nodes: [
        { id: 'n1', type: 'gmail_trigger', label: 'gmail_trigger' },
      ],
      edges: [],
    })

    // Should not have quoted label since it matches type
    expect(result).not.toContain('"gmail_trigger"')
  })

  it('shows connections between nodes', () => {
    const result = formatFlowStateForLLM({
      nodes: [
        { id: 'n1', type: 'trigger_a', label: 'A' },
        { id: 'n2', type: 'action_b', label: 'B' },
        { id: 'n3', type: 'action_c', label: 'C' },
      ],
      edges: [
        { id: 'e1', from: { nodeId: 'n1' }, to: { nodeId: 'n2' } },
        { id: 'e2', from: { nodeId: 'n2' }, to: { nodeId: 'n3' } },
      ],
    })

    expect(result).toContain('Connections')
    expect(result).toContain('trigger_a')
    expect(result).toContain('action_b')
  })

  it('stays under 250 tokens for a 10-node workflow', async () => {
    const { estimateTokens } = await import('@/lib/ai/token-utils')

    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      type: `provider_action_${i}`,
      label: `Action Step ${i}`,
    }))
    const edges = Array.from({ length: 9 }, (_, i) => ({
      id: `e${i}`,
      from: { nodeId: `n${i}` },
      to: { nodeId: `n${i + 1}` },
    }))

    const result = formatFlowStateForLLM({ nodes, edges })
    const tokens = estimateTokens(result)
    expect(tokens).toBeLessThanOrEqual(250)
  })
})

// ============================================================================
// summarizeConversation
// ============================================================================

describe('summarizeConversation', () => {
  let summarizeConversation: any

  beforeAll(async () => {
    const mod = await import('@/lib/ai/token-utils')
    summarizeConversation = mod.summarizeConversation
  })

  afterEach(() => {
    mockCallLLM.mockReset()
  })

  it('skips summarization for short conversations (<=4 messages)', async () => {
    const messages = [
      { role: 'user', content: 'build a workflow' },
      { role: 'assistant', content: 'here it is' },
      { role: 'user', content: 'add a filter' },
    ]

    const result = await summarizeConversation(messages)
    expect(result.wasSummarized).toBe(false)
    expect(result.summary).toBeNull()
    expect(result.recentMessages).toEqual(messages)
    expect(mockCallLLM).not.toHaveBeenCalled()
  })

  it('skips summarization for empty/null input', async () => {
    const result1 = await summarizeConversation([])
    expect(result1.wasSummarized).toBe(false)

    const result2 = await summarizeConversation(null as any)
    expect(result2.wasSummarized).toBe(false)
  })

  it('summarizes older messages and keeps recent ones', async () => {
    mockCallLLM.mockResolvedValue({
      content: 'User wants a Gmail-to-Slack workflow with filtering.',
      model: 'gpt-4o-mini',
      retryCount: 0,
    })

    const messages = [
      { role: 'user', content: 'build email to slack' },
      { role: 'assistant', content: 'built v1' },
      { role: 'user', content: 'add a filter' },
      { role: 'assistant', content: 'added filter' },
      { role: 'user', content: 'change channel to #alerts' },
      { role: 'assistant', content: 'changed channel' },
      { role: 'user', content: 'now add a logger' },
    ]

    const result = await summarizeConversation(messages, { recentMessageCount: 3 })

    expect(result.wasSummarized).toBe(true)
    expect(result.summary).toContain('Gmail-to-Slack')
    expect(result.recentMessages).toHaveLength(3)
    // Recent messages should be the last 3
    expect(result.recentMessages[0].content).toBe('change channel to #alerts')
    expect(result.recentMessages[2].content).toBe('now add a logger')
    expect(mockCallLLM).toHaveBeenCalledTimes(1)
  })

  it('reuses cached summary when conversation has not grown', async () => {
    const messages = [
      { role: 'user', content: 'build workflow' },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'add step' },
      { role: 'assistant', content: 'added' },
      { role: 'user', content: 'looks good' },
    ]

    const result = await summarizeConversation(messages, {
      recentMessageCount: 3,
      cachedSummary: 'Previously cached summary about the workflow.',
      cachedMessageCount: 5, // Same count — hasn't grown
    })

    expect(result.wasSummarized).toBe(true)
    expect(result.summary).toBe('Previously cached summary about the workflow.')
    // Should NOT call LLM since cache is valid
    expect(mockCallLLM).not.toHaveBeenCalled()
  })

  it('re-summarizes when conversation has grown significantly', async () => {
    mockCallLLM.mockResolvedValue({
      content: 'Updated summary.',
      model: 'gpt-4o-mini',
      retryCount: 0,
    })

    const messages = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'msg2' },
      { role: 'user', content: 'msg3' },
      { role: 'assistant', content: 'msg4' },
      { role: 'user', content: 'msg5' },
      { role: 'assistant', content: 'msg6' },
      { role: 'user', content: 'msg7' },
    ]

    const result = await summarizeConversation(messages, {
      recentMessageCount: 3,
      cachedSummary: 'Old cached summary.',
      cachedMessageCount: 4, // Grew by 3 — should re-summarize
    })

    expect(result.wasSummarized).toBe(true)
    expect(result.summary).toBe('Updated summary.')
    expect(mockCallLLM).toHaveBeenCalledTimes(1)
  })

  it('falls back to truncation when LLM fails', async () => {
    mockCallLLM.mockRejectedValue(new Error('LLM unavailable'))

    const messages = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'msg2' },
      { role: 'user', content: 'msg3' },
      { role: 'assistant', content: 'msg4' },
      { role: 'user', content: 'msg5' },
    ]

    const result = await summarizeConversation(messages, { recentMessageCount: 3 })

    expect(result.wasSummarized).toBe(false)
    expect(result.summary).toBeNull()
    // Should still return messages (via truncation fallback)
    expect(result.recentMessages.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// estimateTokens
// ============================================================================

describe('estimateTokens', () => {
  let estimateTokens: any

  beforeAll(async () => {
    const mod = await import('@/lib/ai/token-utils')
    estimateTokens = mod.estimateTokens
  })

  it('estimates ~1 token per 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('12345678')).toBe(2)
  })

  it('rounds up partial tokens', () => {
    expect(estimateTokens('abc')).toBe(1)   // 3/4 = 0.75, ceil = 1
    expect(estimateTokens('abcde')).toBe(2) // 5/4 = 1.25, ceil = 2
  })

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })
})
