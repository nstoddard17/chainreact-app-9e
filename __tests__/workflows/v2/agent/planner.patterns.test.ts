/**
 * Tests for the planner's fast-path pattern matching.
 *
 * Verifies that common prompts hit the right templates ($0 cost)
 * and that unrecognized prompts correctly fall through to LLM.
 */

// We need to test the internal matchIntentToPlan function.
// Since it's not exported, we test via planEdits with LLM disabled.

import { buildFlow } from '../system/helpers.support'

// Mock the LLM calls so we only test pattern matching
jest.mock('@/lib/ai/llm-retry', () => ({
  callLLMWithRetry: jest.fn().mockRejectedValue(new Error('LLM disabled in test')),
  parseLLMJson: jest.fn(),
}))

// Mock the plan cache
jest.mock('@/lib/ai/plan-cache', () => ({
  getCachedPlan: jest.fn().mockReturnValue(null),
  cachePlan: jest.fn(),
}))

// Mock the template catalog (DB templates)
jest.mock('@/lib/ai/template-catalog', () => ({
  getTemplateCatalog: jest.fn().mockResolvedValue([]),
  formatTemplateCatalogForLLM: jest.fn().mockReturnValue(''),
}))

// Mock crypto.randomUUID for deterministic node IDs
let uuidCounter = 0
jest.spyOn(crypto, 'randomUUID').mockImplementation(() => {
  uuidCounter++
  return `00000000-0000-0000-0000-${String(uuidCounter).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`
})

import { planEdits } from '@/src/lib/workflows/builder/agent/planner'

const emptyFlow = buildFlow({ nodes: [], edges: [] })

beforeEach(() => {
  uuidCounter = 0
})

describe('Pattern matching – fast-path templates', () => {
  it('matches "email to slack" prompt', async () => {
    const result = await planEdits({
      prompt: 'when I get an email forward it to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    expect(result.edits.length).toBeGreaterThan(0)
    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const nodeTypes = addNodeEdits.map(e => (e as any).node.type)

    expect(nodeTypes).toContain('gmail_trigger_new_email')
    expect(nodeTypes).toContain('slack_action_send_message')
    expect(result.planningMethod).toBe('pattern')
  })

  it('matches "gmail slack" prompt', async () => {
    const result = await planEdits({
      prompt: 'gmail to slack notifications',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const nodeTypes = addNodeEdits.map(e => (e as any).node.type)

    expect(nodeTypes).toContain('gmail_trigger_new_email')
    expect(nodeTypes).toContain('slack_action_send_message')
  })

  it('matches "google sheets to slack" prompt', async () => {
    const result = await planEdits({
      prompt: 'when a new row is added to google sheets send to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const nodeTypes = addNodeEdits.map(e => (e as any).node.type)

    expect(nodeTypes).toContain('google_sheets_trigger_new_row')
    expect(nodeTypes).toContain('slack_action_send_message')
  })

  it('matches "spreadsheet to discord" prompt', async () => {
    const result = await planEdits({
      prompt: 'new spreadsheet row notify discord',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const nodeTypes = addNodeEdits.map(e => (e as any).node.type)

    expect(nodeTypes).toContain('google_sheets_trigger_new_row')
    expect(nodeTypes).toContain('discord_action_send_message')
  })

  it('matches "webhook to slack" prompt', async () => {
    const result = await planEdits({
      prompt: 'send webhook data to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const nodeTypes = addNodeEdits.map(e => (e as any).node.type)

    expect(nodeTypes).toContain('http.trigger')
    expect(nodeTypes).toContain('slack_action_send_message')
  })

  it('matches "email summarize slack" prompt', async () => {
    const result = await planEdits({
      prompt: 'summarize my emails and send a digest to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const nodeTypes = addNodeEdits.map(e => (e as any).node.type)

    expect(nodeTypes).toContain('gmail_trigger_new_email')
    expect(nodeTypes).toContain('ai_summarize')
    expect(nodeTypes).toContain('slack_action_send_message')
  })

  it('matches "airtable to slack" prompt', async () => {
    const result = await planEdits({
      prompt: 'notify slack when airtable gets a new record',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const nodeTypes = addNodeEdits.map(e => (e as any).node.type)

    expect(nodeTypes).toContain('airtable_trigger_new_record')
    expect(nodeTypes).toContain('slack_action_send_message')
  })

  it('matches "notion to slack" prompt', async () => {
    const result = await planEdits({
      prompt: 'when a new page is created in notion post to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const nodeTypes = addNodeEdits.map(e => (e as any).node.type)

    expect(nodeTypes).toContain('notion_trigger_database_item_created')
    expect(nodeTypes).toContain('slack_action_send_message')
  })

  it('matches "extract email to sheets" prompt', async () => {
    const result = await planEdits({
      prompt: 'extract data from emails and save to google sheets',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const nodeTypes = addNodeEdits.map(e => (e as any).node.type)

    expect(nodeTypes).toContain('gmail_trigger_new_email')
    expect(nodeTypes).toContain('ai_extract')
  })
})

describe('Pattern matching – creates valid workflow structure', () => {
  it('creates edges connecting nodes in sequence', async () => {
    const result = await planEdits({
      prompt: 'email to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const connectEdits = result.edits.filter(e => e.op === 'connect')

    // Should have at least 1 edge for 2 nodes
    expect(addNodeEdits.length).toBeGreaterThanOrEqual(2)
    expect(connectEdits.length).toBeGreaterThanOrEqual(1)

    // Each edge should reference valid node IDs
    const nodeIds = new Set(addNodeEdits.map(e => (e as any).node.id))
    for (const edge of connectEdits) {
      const e = edge as any
      expect(nodeIds.has(e.edge.from.nodeId)).toBe(true)
      expect(nodeIds.has(e.edge.to.nodeId)).toBe(true)
    }
  })

  it('generates a workflow name', async () => {
    const result = await planEdits({
      prompt: 'email to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    // Workflow name should exist (either from AI or fallback)
    expect(result.workflowName).toBeDefined()
    expect(typeof result.workflowName).toBe('string')
  })

  it('generates a deterministic hash', async () => {
    const result = await planEdits({
      prompt: 'email to slack',
      flow: emptyFlow,
      useLLM: false,
    })

    expect(result.deterministicHash).toBeDefined()
    expect(result.deterministicHash.length).toBeGreaterThan(0)
  })
})

describe('Vague prompt detection — asks clarifying questions', () => {
  it('detects "user retention workflow" as vague', async () => {
    const result = await planEdits({
      prompt: 'I would like help creating a user retention workflow',
      flow: emptyFlow,
      useLLM: false,
    })
    expect(result.edits).toHaveLength(0)
    expect(result.clarifyingQuestions).toBeDefined()
    expect(result.clarifyingQuestions!.length).toBeGreaterThan(0)
  })

  it('detects "improve engagement" as vague', async () => {
    const result = await planEdits({
      prompt: 'improve user engagement',
      flow: emptyFlow,
      useLLM: false,
    })
    expect(result.edits).toHaveLength(0)
    expect(result.clarifyingQuestions).toBeDefined()
  })

  it('detects "automate onboarding" as vague', async () => {
    const result = await planEdits({
      prompt: 'automate my onboarding process',
      flow: emptyFlow,
      useLLM: false,
    })
    expect(result.edits).toHaveLength(0)
    expect(result.clarifyingQuestions).toBeDefined()
  })

  it('detects "help with marketing" as vague', async () => {
    const result = await planEdits({
      prompt: 'help me with marketing automation',
      flow: emptyFlow,
      useLLM: false,
    })
    expect(result.edits).toHaveLength(0)
    expect(result.clarifyingQuestions).toBeDefined()
  })

  it('detects "create a workflow" as vague', async () => {
    const result = await planEdits({
      prompt: 'create a workflow',
      flow: emptyFlow,
      useLLM: false,
    })
    expect(result.edits).toHaveLength(0)
    expect(result.clarifyingQuestions).toBeDefined()
  })

  it('detects "make my business better" as vague', async () => {
    const result = await planEdits({
      prompt: 'make my business better',
      flow: emptyFlow,
      useLLM: false,
    })
    expect(result.edits).toHaveLength(0)
    expect(result.clarifyingQuestions).toBeDefined()
  })
})

describe('Vague detection — specific prompts proceed to planning', () => {
  it('proceeds with "email to slack" (has app + action)', async () => {
    const result = await planEdits({
      prompt: 'when I get an email forward it to slack',
      flow: emptyFlow,
      useLLM: false,
    })
    expect(result.edits.length).toBeGreaterThan(0)
    expect(result.clarifyingQuestions).toBeUndefined()
  })

  it('proceeds with "send slack notification from sheets"', async () => {
    const result = await planEdits({
      prompt: 'send a slack notification when a new row is added to google sheets',
      flow: emptyFlow,
      useLLM: false,
    })
    expect(result.edits.length).toBeGreaterThan(0)
  })

  it('proceeds with app mention only (e.g., "gmail and slack")', async () => {
    const result = await planEdits({
      prompt: 'connect gmail and slack together',
      flow: emptyFlow,
      useLLM: false,
    })
    // Mentioning specific apps = not vague
    expect(result.clarifyingQuestions).toBeUndefined()
  })
})
