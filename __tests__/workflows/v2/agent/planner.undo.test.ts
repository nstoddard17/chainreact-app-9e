/**
 * Tests for undo/revert functionality in the AI workflow planner.
 *
 * Covers:
 * - Undo prompt detection (looksLikeUndoRequest)
 * - Snapshot retrieval from conversation history (findPreviousSnapshot)
 * - Undo edit generation (buildUndoEdits)
 * - End-to-end undo via planEdits()
 */

import { buildFlow } from '../system/helpers.support'

// Mock the LLM calls so we only test undo logic
jest.mock('@/lib/ai/llm-retry', () => ({
  callLLMWithRetry: jest.fn().mockRejectedValue(new Error('LLM disabled in test')),
  parseLLMJson: jest.fn(),
}))

jest.mock('@/lib/ai/plan-cache', () => ({
  getCachedPlan: jest.fn().mockReturnValue(null),
  cachePlan: jest.fn(),
}))

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

import {
  looksLikeUndoRequest,
  findPreviousSnapshot,
  buildUndoEdits,
  planEdits,
} from '@/src/lib/workflows/builder/agent/planner'
import type { ConversationMessage } from '@/src/lib/workflows/builder/agent/types'

beforeEach(() => {
  uuidCounter = 0
})

// ============================================================================
// looksLikeUndoRequest
// ============================================================================

describe('looksLikeUndoRequest', () => {
  it.each([
    'undo',
    'Undo',
    'undo that',
    'undo the last change',
    'revert',
    'revert that',
    'revert the last change',
    'change it back',
    'put it back',
    'go back',
    'never mind',
    'nevermind',
    'restore previous',
    'restore the previous',
  ])('matches undo prompt: "%s"', (prompt) => {
    expect(looksLikeUndoRequest(prompt)).toBe(true)
  })

  it.each([
    'add a slack step',
    'remove the email step',
    'when I get an email forward it to slack',
    'change the channel to #general',
    'swap step 1 and step 2',
    'build a CRM workflow',
    'redo the layout',
  ])('does NOT match non-undo prompt: "%s"', (prompt) => {
    expect(looksLikeUndoRequest(prompt)).toBe(false)
  })
})

// ============================================================================
// findPreviousSnapshot
// ============================================================================

describe('findPreviousSnapshot', () => {
  it('returns null for empty conversation history', () => {
    expect(findPreviousSnapshot([])).toBeNull()
    expect(findPreviousSnapshot(undefined)).toBeNull()
  })

  it('returns null when no messages have snapshots', () => {
    const history: ConversationMessage[] = [
      { role: 'user', content: 'build a workflow', timestamp: '2024-01-01' },
      { role: 'assistant', content: 'Here is your workflow', timestamp: '2024-01-01' },
    ]
    expect(findPreviousSnapshot(history)).toBeNull()
  })

  it('returns the only snapshot when there is just one', () => {
    const snapshot = JSON.stringify({
      nodes: [{ id: 'n1', type: 'gmail_trigger', label: 'Gmail' }],
      edges: [],
    })
    const history: ConversationMessage[] = [
      { role: 'user', content: 'build a workflow', timestamp: '2024-01-01' },
      {
        role: 'assistant',
        content: 'Here is your workflow',
        timestamp: '2024-01-01',
        metadata: { workflowSnapshot: snapshot },
      },
    ]
    const result = findPreviousSnapshot(history)
    expect(result).not.toBeNull()
    expect(result!.nodes).toHaveLength(1)
    expect(result!.nodes[0].type).toBe('gmail_trigger')
  })

  it('returns the second-most-recent snapshot (state before last change)', () => {
    const snapshotV1 = JSON.stringify({
      nodes: [{ id: 'n1', type: 'gmail_trigger', label: 'Gmail' }],
      edges: [],
    })
    const snapshotV2 = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'gmail_trigger', label: 'Gmail' },
        { id: 'n2', type: 'slack_action', label: 'Slack' },
      ],
      edges: [{ from: 'n1', to: 'n2' }],
    })
    const history: ConversationMessage[] = [
      { role: 'user', content: 'build email to slack', timestamp: '2024-01-01' },
      {
        role: 'assistant',
        content: 'Built v1',
        timestamp: '2024-01-01',
        metadata: { workflowSnapshot: snapshotV1 },
      },
      { role: 'user', content: 'add a slack step', timestamp: '2024-01-02' },
      {
        role: 'assistant',
        content: 'Added slack',
        timestamp: '2024-01-02',
        metadata: { workflowSnapshot: snapshotV2 },
      },
    ]
    const result = findPreviousSnapshot(history)
    expect(result).not.toBeNull()
    // Should return V1 (the state BEFORE the last change)
    expect(result!.nodes).toHaveLength(1)
    expect(result!.nodes[0].type).toBe('gmail_trigger')
  })

  it('handles invalid JSON in snapshot gracefully', () => {
    const history: ConversationMessage[] = [
      {
        role: 'assistant',
        content: 'Here it is',
        timestamp: '2024-01-01',
        metadata: { workflowSnapshot: 'not valid json{{{' },
      },
    ]
    expect(findPreviousSnapshot(history)).toBeNull()
  })
})

// ============================================================================
// buildUndoEdits
// ============================================================================

describe('buildUndoEdits', () => {
  it('generates removeNode edits for all current nodes', () => {
    const currentNodes = buildFlow({
      nodes: [
        { id: 'n1', type: 'gmail_trigger', label: 'Gmail' },
        { id: 'n2', type: 'slack_action', label: 'Slack' },
      ],
      edges: [{ from: 'n1', to: 'n2', mappings: [] }],
    }).nodes

    const snapshot = {
      nodes: [{ id: 'n1', type: 'gmail_trigger', label: 'Gmail' }],
      edges: [],
    }

    const edits = buildUndoEdits(snapshot, currentNodes)
    const removeEdits = edits.filter(e => e.op === 'removeNode')
    expect(removeEdits).toHaveLength(2) // removes both current nodes
  })

  it('generates addNode edits for snapshot nodes', () => {
    const currentNodes = buildFlow({
      nodes: [{ id: 'n1', type: 'gmail_trigger', label: 'Gmail' }],
      edges: [],
    }).nodes

    const snapshot = {
      nodes: [
        { id: 'old1', type: 'slack_trigger', label: 'Slack Trigger' },
        { id: 'old2', type: 'discord_action', label: 'Discord' },
      ],
      edges: [{ from: 'old1', to: 'old2' }],
    }

    const edits = buildUndoEdits(snapshot, currentNodes)
    const addEdits = edits.filter(e => e.op === 'addNode')
    expect(addEdits).toHaveLength(2)

    const addedTypes = addEdits.map(e => (e as any).node.type)
    expect(addedTypes).toContain('slack_trigger')
    expect(addedTypes).toContain('discord_action')
  })

  it('generates connect edits for snapshot edges', () => {
    const currentNodes = buildFlow({ nodes: [], edges: [] }).nodes

    const snapshot = {
      nodes: [
        { id: 'a', type: 'trigger', label: 'Trigger' },
        { id: 'b', type: 'action', label: 'Action' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    }

    const edits = buildUndoEdits(snapshot, currentNodes)
    const connectEdits = edits.filter(e => e.op === 'connect')
    expect(connectEdits).toHaveLength(1)
    expect((connectEdits[0] as any).edge.from.nodeId).toBe('a')
    expect((connectEdits[0] as any).edge.to.nodeId).toBe('b')
  })

  it('handles empty snapshot (clears everything)', () => {
    const currentNodes = buildFlow({
      nodes: [{ id: 'n1', type: 'test', label: 'Test' }],
      edges: [],
    }).nodes

    const snapshot = { nodes: [], edges: [] }
    const edits = buildUndoEdits(snapshot, currentNodes)
    const removeEdits = edits.filter(e => e.op === 'removeNode')
    const addEdits = edits.filter(e => e.op === 'addNode')
    expect(removeEdits).toHaveLength(1)
    expect(addEdits).toHaveLength(0)
  })
})

// ============================================================================
// planEdits integration test for undo
// ============================================================================

describe('planEdits with undo prompt', () => {
  it('returns undo result when snapshot is available', async () => {
    const snapshot = JSON.stringify({
      nodes: [{ id: 'orig1', type: 'gmail_trigger', label: 'Gmail' }],
      edges: [],
    })

    const flow = buildFlow({
      nodes: [
        { id: 'n1', type: 'gmail_trigger', label: 'Gmail' },
        { id: 'n2', type: 'slack_action', label: 'Slack' },
      ],
      edges: [{ from: 'n1', to: 'n2', mappings: [] }],
    })

    const result = await planEdits({
      prompt: 'undo',
      flow,
      conversationHistory: [
        { role: 'user', content: 'build email to slack', timestamp: '2024-01-01' },
        {
          role: 'assistant',
          content: 'Built it',
          timestamp: '2024-01-01',
          metadata: { workflowSnapshot: snapshot },
        },
      ],
    })

    expect(result.rationale).toContain('previous state')
    expect(result.planningMethod).toBe('pattern')
    expect(result.edits.length).toBeGreaterThan(0)
  })

  it('returns informative message when no snapshot available', async () => {
    const flow = buildFlow({
      nodes: [{ id: 'n1', type: 'test', label: 'Test' }],
      edges: [],
    })

    const result = await planEdits({
      prompt: 'undo',
      flow,
      conversationHistory: [],
    })

    expect(result.rationale).toContain("don't have a previous version")
    expect(result.edits).toHaveLength(0)
  })
})
