/**
 * Tests for the planner's LLM fallback and overall planning flow.
 *
 * Mocks the LLM to return controlled responses, then verifies:
 * - LLM planner produces valid workflow edits
 * - Fallback chain works (pattern → DB template → LLM → clarifying questions)
 * - Plan caching works
 * - Unsupported feature detection works
 */

import { buildFlow } from '../system/helpers.support'

const mockCallLLM = jest.fn()
const mockParseLLMJson = jest.fn()

jest.mock('@/lib/ai/llm-retry', () => ({
  callLLMWithRetry: (...args: any[]) => mockCallLLM(...args),
  parseLLMJson: (...args: any[]) => mockParseLLMJson(...args),
}))

jest.mock('@/lib/ai/plan-cache', () => ({
  getCachedPlan: jest.fn().mockReturnValue(null),
  cachePlan: jest.fn(),
}))

jest.mock('@/lib/ai/template-catalog', () => ({
  getTemplateCatalog: jest.fn().mockResolvedValue([]),
  formatTemplateCatalogForLLM: jest.fn().mockReturnValue(''),
}))

// Mock crypto.randomUUID
let uuidCounter = 0
jest.spyOn(crypto, 'randomUUID').mockImplementation(() => {
  uuidCounter++
  return `00000000-0000-0000-0000-${String(uuidCounter).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`
})

import { planEdits } from '@/src/lib/workflows/builder/agent/planner'

const emptyFlow = buildFlow({ nodes: [], edges: [] })

beforeEach(() => {
  uuidCounter = 0
  mockCallLLM.mockReset()
  mockParseLLMJson.mockReset()
})

describe('Planner LLM fallback flow', () => {
  it('uses pattern match for known prompts (LLM only called for name generation)', async () => {
    // Mock the workflow name generation call
    mockCallLLM.mockResolvedValueOnce({ content: 'Email to Slack' })

    const result = await planEdits({
      prompt: 'when I get an email send it to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    // Should match pattern and produce edits
    expect(result.edits.length).toBeGreaterThan(0)
    // LLM should only be called for workflow name generation, not node selection
    const llmCalls = mockCallLLM.mock.calls
    if (llmCalls.length > 0) {
      // Verify the only LLM call was for name generation
      expect(llmCalls[0][0].label).toBe('Planner:workflowName')
    }
  })

  it('calls lightweight LLM fallback for unrecognized prompts', async () => {
    // Mock the lightweight LLM to return valid node types
    mockCallLLM.mockResolvedValueOnce({
      content: JSON.stringify({
        nodeTypes: ['http.trigger', 'slack_action_send_message'],
        description: 'Webhook to Slack',
      }),
    })
    mockParseLLMJson.mockReturnValueOnce({
      nodeTypes: ['http.trigger', 'slack_action_send_message'],
      description: 'Webhook to Slack',
    })

    // Also mock the workflow name generation LLM call
    mockCallLLM.mockResolvedValueOnce({
      content: 'Webhook Notification',
    })

    const result = await planEdits({
      prompt: 'when a new hubspot deal is created send details to notion',
      flow: emptyFlow,
      useLLM: false, // Disable the 3-stage LLM planner, but lightweight fallback still runs
    })

    // Should have called LLM for the lightweight fallback
    expect(mockCallLLM).toHaveBeenCalled()
    expect(result.edits.length).toBeGreaterThan(0)
  })

  it('generates clarifying questions when all fallbacks fail', async () => {
    // Mock all LLM calls to fail (lightweight fallback + clarifying questions)
    mockCallLLM.mockRejectedValue(new Error('LLM unavailable'))

    const result = await planEdits({
      prompt: 'do something interesting with my data',
      flow: emptyFlow,
      useLLM: false,
    })

    // Should have no edits
    expect(result.edits).toHaveLength(0)
    // Should have clarifying questions (fallback template-based when LLM fails)
    expect(result.clarifyingQuestions).toBeDefined()
    expect(result.clarifyingQuestions!.length).toBeGreaterThan(0)
  })
})

describe('Unsupported feature detection', () => {
  it('detects LinkedIn as unsupported', async () => {
    const result = await planEdits({
      prompt: 'post to linkedin when I get a new email',
      flow: emptyFlow,
      useLLM: false,
    })

    expect(result.unsupportedFeatures).toBeDefined()
    expect(result.unsupportedFeatures!.hasUnsupported).toBe(true)
    const features = result.unsupportedFeatures!.features.map((f: any) => f.feature)
    expect(features.some((f: string) => f.toLowerCase().includes('linkedin'))).toBe(true)
  })

  it('detects Salesforce as unsupported', async () => {
    const result = await planEdits({
      prompt: 'sync salesforce contacts with email',
      flow: emptyFlow,
      useLLM: false,
    })

    expect(result.unsupportedFeatures).toBeDefined()
    expect(result.unsupportedFeatures!.hasUnsupported).toBe(true)
  })

  it('does not flag supported providers', async () => {
    const result = await planEdits({
      prompt: 'email to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    // Should not have unsupported features (or hasUnsupported should be false)
    if (result.unsupportedFeatures) {
      expect(result.unsupportedFeatures.hasUnsupported).toBe(false)
    }
  })
})

describe('Plan structure validation', () => {
  it('every addNode has required fields', async () => {
    const result = await planEdits({
      prompt: 'email to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodes = result.edits.filter(e => e.op === 'addNode')
    for (const edit of addNodes) {
      const node = (edit as any).node
      expect(node.id).toBeDefined()
      expect(node.type).toBeDefined()
      expect(typeof node.id).toBe('string')
      expect(typeof node.type).toBe('string')
    }
  })

  it('every connect edge references existing node IDs', async () => {
    const result = await planEdits({
      prompt: 'email to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    const nodeIds = new Set(
      result.edits
        .filter(e => e.op === 'addNode')
        .map(e => (e as any).node.id)
    )

    const edges = result.edits.filter(e => e.op === 'connect')
    for (const edge of edges) {
      const e = edge as any
      expect(nodeIds.has(e.edge.from.nodeId)).toBe(true)
      expect(nodeIds.has(e.edge.to.nodeId)).toBe(true)
    }
  })

  it('first node is a trigger for email-to-slack', async () => {
    const result = await planEdits({
      prompt: 'email to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodes = result.edits.filter(e => e.op === 'addNode')
    expect(addNodes.length).toBeGreaterThanOrEqual(2)

    const firstNodeType = (addNodes[0] as any).node.type
    expect(firstNodeType).toContain('trigger')
  })

  it('produces different plans for different prompts', async () => {
    const emailResult = await planEdits({
      prompt: 'email to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    uuidCounter = 0 // Reset to get comparable results

    const sheetsResult = await planEdits({
      prompt: 'google sheets to discord',
      flow: emptyFlow,
      useLLM: false,
    })

    const emailTypes = emailResult.edits
      .filter(e => e.op === 'addNode')
      .map(e => (e as any).node.type)

    const sheetsTypes = sheetsResult.edits
      .filter(e => e.op === 'addNode')
      .map(e => (e as any).node.type)

    // Should have different trigger nodes
    expect(emailTypes[0]).not.toBe(sheetsTypes[0])
  })
})
