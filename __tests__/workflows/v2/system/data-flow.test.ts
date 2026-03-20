/**
 * Multi-Node Data Flow System Tests
 *
 * Tests that data passes correctly through workflow chains using the
 * v2 execution engine. Each test builds a multi-node flow with explicit
 * edge mappings and verifies that output from one node correctly feeds
 * into the next node's input.
 *
 * Run: npm run test:system
 */

import fetchMock from 'jest-fetch-mock'

jest.mock('@/utils/supabase/server', () => ({
  createSupabaseServiceClient: jest.fn(async () => {
    const chain: any = {
      select: () => chain, eq: () => chain, is: () => chain,
      order: () => chain, maybeSingle: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      insert: async () => ({ data: null, error: null }),
    }
    return { from: () => chain }
  }),
}))

import { executeRun } from '@/src/lib/workflows/builder/runner/execute'
import { registerNodeDefinition, clearNodeRunners } from '@/src/lib/workflows/builder/runner/registry'
import type { NodeDefinition } from '@/src/lib/workflows/builder/nodes/types'
import { z } from 'zod'
import { InMemoryRunStore, buildFlow } from './helpers'

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeAll(() => {
  fetchMock.enableMocks()
})

beforeEach(() => {
  fetchMock.resetMocks()
  clearNodeRunners()
  registerCoreNodes()
})

/** Register reusable mock node types */
function registerCoreNodes() {
  // Trigger: passes through input payload
  registerNodeDefinition({
    type: 'test.trigger',
    title: 'Test Trigger',
    description: 'Mock trigger for testing',
    configSchema: z.object({}),
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({}).passthrough(),
    costHint: 0,
    async run({ input }) {
      return { output: input }
    },
  })

  // Transform: uppercases string fields
  registerNodeDefinition({
    type: 'test.uppercase',
    title: 'Uppercase Transform',
    description: 'Uppercases text field',
    configSchema: z.object({}),
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({}).passthrough(),
    costHint: 0,
    async run({ input }) {
      const output: any = {}
      for (const [key, value] of Object.entries(input)) {
        output[key] = typeof value === 'string' ? value.toUpperCase() : value
      }
      return { output }
    },
  })

  // Enricher: adds metadata
  registerNodeDefinition({
    type: 'test.enrich',
    title: 'Enrich Data',
    description: 'Adds metadata fields',
    configSchema: z.object({ prefix: z.string().optional() }),
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({}).passthrough(),
    costHint: 0,
    async run({ input, config }) {
      return {
        output: {
          ...input,
          enriched: true,
          processedAt: '2024-01-01T00:00:00Z',
          label: `${config.prefix || 'item'}-${input.id || 'unknown'}`,
        },
      }
    },
  })

  // Aggregator: combines multiple fields into summary
  registerNodeDefinition({
    type: 'test.aggregate',
    title: 'Aggregate',
    description: 'Combines fields',
    configSchema: z.object({}),
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({}).passthrough(),
    costHint: 0,
    async run({ input }) {
      return {
        output: {
          summary: Object.values(input).filter(v => typeof v === 'string').join(' | '),
          fieldCount: Object.keys(input).length,
          data: input,
        },
      }
    },
  })

  // HTTP sender: makes an external HTTP call (uses fetch mock)
  registerNodeDefinition({
    type: 'test.http_send',
    title: 'HTTP Send',
    description: 'Sends data via HTTP',
    configSchema: z.object({ url: z.string().optional() }),
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({}).passthrough(),
    costHint: 1,
    async run({ input, config }) {
      const url = config.url || 'https://api.example.com/data'
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const responseData = await response.json()
      return { output: { sent: true, response: responseData } }
    },
  })

  // Filter: passes through or blocks based on condition
  registerNodeDefinition({
    type: 'test.filter',
    title: 'Filter',
    description: 'Filters data based on a field value',
    configSchema: z.object({ field: z.string().optional(), value: z.any().optional() }),
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({}).passthrough(),
    costHint: 0,
    async run({ input, config }) {
      const field = config.field || 'status'
      const expectedValue = config.value ?? 'active'
      const actualValue = (input as any)[field]
      const passes = actualValue === expectedValue || String(actualValue) === String(expectedValue)
      return {
        output: {
          ...input,
          filtered: true,
          passed: passes,
        },
      }
    },
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Two-Node Chain: Trigger → Action', () => {
  test('trigger output is correctly mapped to action input', async () => {
    const store = new InMemoryRunStore()
    const flow = buildFlow({
      nodes: [
        { id: 'trigger', type: 'test.trigger', label: 'Trigger' },
        { id: 'action', type: 'test.uppercase', label: 'Uppercase' },
      ],
      edges: [{
        from: 'trigger',
        to: 'action',
        mappings: [{ to: 'text', expr: 'upstream.message' }],
      }],
      triggerId: 'trigger',
    })

    await executeRun({
      flow,
      revisionId: 'rev-1',
      runId: 'run-1',
      inputs: { message: 'hello world' },
      store,
    })

    const actionSnap = store.getSnapshot('run-1', 'action')
    expect(actionSnap?.status).toBe('success')
    expect(actionSnap?.input).toEqual({ text: 'hello world' })
    expect(actionSnap?.output).toEqual({ text: 'HELLO WORLD' })
  })
})

describe('Three-Node Chain: Trigger → Transform → Send', () => {
  test('data flows through transform to HTTP send', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ received: true }))

    const store = new InMemoryRunStore()
    const flow = buildFlow({
      nodes: [
        { id: 'trigger', type: 'test.trigger', label: 'Trigger' },
        { id: 'transform', type: 'test.uppercase', label: 'Uppercase' },
        { id: 'send', type: 'test.http_send', label: 'Send', config: { url: 'https://webhook.test/endpoint' } },
      ],
      edges: [
        {
          from: 'trigger',
          to: 'transform',
          mappings: [{ to: 'name', expr: 'upstream.name' }],
        },
        {
          from: 'transform',
          to: 'send',
          mappings: [{ to: 'processedName', expr: 'upstream.name' }],
        },
      ],
      triggerId: 'trigger',
    })

    await executeRun({
      flow,
      revisionId: 'rev-1',
      runId: 'run-1',
      inputs: { name: 'alice' },
      store,
    })

    // Verify the chain
    const triggerSnap = store.getSnapshot('run-1', 'trigger')
    expect(triggerSnap?.output).toEqual({ name: 'alice' })

    const transformSnap = store.getSnapshot('run-1', 'transform')
    expect(transformSnap?.input).toEqual({ name: 'alice' })
    expect(transformSnap?.output).toEqual({ name: 'ALICE' })

    const sendSnap = store.getSnapshot('run-1', 'send')
    expect(sendSnap?.input).toEqual({ processedName: 'ALICE' })
    expect(sendSnap?.status).toBe('success')
    expect(sendSnap?.output?.sent).toBe(true)

    // Verify the HTTP call received the transformed data
    expect(fetchMock).toHaveBeenCalledWith(
      'https://webhook.test/endpoint',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ processedName: 'ALICE' }),
      })
    )
  })
})

describe('Four-Node Chain: Trigger → Enrich → Filter → Aggregate', () => {
  test('complex multi-step data transformation works end-to-end', async () => {
    const store = new InMemoryRunStore()
    const flow = buildFlow({
      nodes: [
        { id: 'trigger', type: 'test.trigger', label: 'Trigger' },
        { id: 'enrich', type: 'test.enrich', label: 'Enrich', config: { prefix: 'user' } },
        { id: 'filter', type: 'test.filter', label: 'Filter', config: { field: 'enriched', value: true } },
        { id: 'aggregate', type: 'test.aggregate', label: 'Aggregate' },
      ],
      edges: [
        {
          from: 'trigger',
          to: 'enrich',
          mappings: [
            { to: 'id', expr: 'upstream.userId' },
            { to: 'name', expr: 'upstream.userName' },
          ],
        },
        {
          from: 'enrich',
          to: 'filter',
          mappings: [
            { to: 'enriched', expr: 'upstream.enriched' },
            { to: 'label', expr: 'upstream.label' },
          ],
        },
        {
          from: 'filter',
          to: 'aggregate',
          mappings: [
            { to: 'label', expr: 'upstream.label' },
            { to: 'passed', expr: 'upstream.passed' },
          ],
        },
      ],
      triggerId: 'trigger',
    })

    await executeRun({
      flow,
      revisionId: 'rev-1',
      runId: 'run-1',
      inputs: { userId: '42', userName: 'Alice' },
      store,
    })

    const runData = store.runs.get('run-1')
    expect(runData?.status).toBe('success')

    // Check each step
    const enrichSnap = store.getSnapshot('run-1', 'enrich')
    expect(enrichSnap?.output?.label).toBe('user-42')
    expect(enrichSnap?.output?.enriched).toBe(true)

    const filterSnap = store.getSnapshot('run-1', 'filter')
    expect(filterSnap?.output?.passed).toBeDefined()

    const aggSnap = store.getSnapshot('run-1', 'aggregate')
    expect(aggSnap?.status).toBe('success')
    expect(aggSnap?.output?.summary).toBeDefined()
    expect(aggSnap?.output?.fieldCount).toBeGreaterThan(0)
  })
})

describe('Data Lineage Tracking', () => {
  test('lineage records track data flow across edges', async () => {
    const store = new InMemoryRunStore()
    const flow = buildFlow({
      nodes: [
        { id: 'trigger', type: 'test.trigger', label: 'Trigger' },
        { id: 'step1', type: 'test.uppercase', label: 'Step 1' },
        { id: 'step2', type: 'test.enrich', label: 'Step 2', config: { prefix: 'x' } },
      ],
      edges: [
        {
          from: 'trigger',
          to: 'step1',
          mappings: [{ to: 'text', expr: 'upstream.message' }],
        },
        {
          from: 'step1',
          to: 'step2',
          mappings: [{ to: 'id', expr: 'upstream.text' }],
        },
      ],
      triggerId: 'trigger',
    })

    await executeRun({
      flow,
      revisionId: 'rev-1',
      runId: 'run-1',
      inputs: { message: 'hello' },
      store,
    })

    // Should have 2 lineage records (one per edge mapping)
    expect(store.lineage.length).toBe(2)

    // First edge: trigger → step1
    expect(store.lineage[0]).toMatchObject({
      fromNodeId: 'trigger',
      toNodeId: 'step1',
      targetPath: 'text',
    })

    // Second edge: step1 → step2
    expect(store.lineage[1]).toMatchObject({
      fromNodeId: 'step1',
      toNodeId: 'step2',
      targetPath: 'id',
    })
  })
})

describe('Error Handling in Chains', () => {
  test('node failure captures error without crashing the runner', async () => {
    // Register a node that throws
    registerNodeDefinition({
      type: 'test.crash',
      title: 'Crash Node',
      description: 'Always throws',
      configSchema: z.object({}),
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}).passthrough(),
      costHint: 0,
      async run() {
        throw new Error('Simulated failure: API returned 500')
      },
    })

    const store = new InMemoryRunStore()
    const flow = buildFlow({
      nodes: [
        { id: 'trigger', type: 'test.trigger', label: 'Trigger' },
        { id: 'crash', type: 'test.crash', label: 'Crash' },
      ],
      edges: [{
        from: 'trigger',
        to: 'crash',
        mappings: [{ to: 'data', expr: 'upstream.data' }],
      }],
      triggerId: 'trigger',
    })

    await executeRun({
      flow,
      revisionId: 'rev-1',
      runId: 'run-1',
      inputs: { data: 'test' },
      store,
    })

    // The trigger should succeed
    const triggerSnap = store.getSnapshot('run-1', 'trigger')
    expect(triggerSnap?.status).toBe('success')

    // The crash node should show error status
    const crashSnap = store.getSnapshot('run-1', 'crash')
    expect(crashSnap?.status).toBe('error')
    expect(crashSnap?.error).toBeDefined()

    // The overall run should be marked as failed
    const run = store.runs.get('run-1')
    expect(run?.status).toBe('error')
  })
})

describe('Multiple Input Mappings', () => {
  test('node receives data from multiple mapped fields', async () => {
    const store = new InMemoryRunStore()
    const flow = buildFlow({
      nodes: [
        { id: 'trigger', type: 'test.trigger', label: 'Trigger' },
        { id: 'agg', type: 'test.aggregate', label: 'Aggregate' },
      ],
      edges: [{
        from: 'trigger',
        to: 'agg',
        mappings: [
          { to: 'firstName', expr: 'upstream.first' },
          { to: 'lastName', expr: 'upstream.last' },
          { to: 'email', expr: 'upstream.email' },
        ],
      }],
      triggerId: 'trigger',
    })

    await executeRun({
      flow,
      revisionId: 'rev-1',
      runId: 'run-1',
      inputs: { first: 'John', last: 'Doe', email: 'john@example.com' },
      store,
    })

    const aggSnap = store.getSnapshot('run-1', 'agg')
    expect(aggSnap?.status).toBe('success')
    expect(aggSnap?.input).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    })
    expect(aggSnap?.output?.summary).toContain('John')
    expect(aggSnap?.output?.summary).toContain('Doe')
    expect(aggSnap?.output?.fieldCount).toBe(3)
  })
})

describe('Expression Evaluation', () => {
  test('supports computed expressions in edge mappings', async () => {
    registerNodeDefinition({
      type: 'test.passthrough',
      title: 'Passthrough',
      description: '',
      configSchema: z.object({}),
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}).passthrough(),
      costHint: 0,
      async run({ input }) { return { output: input } },
    })

    const store = new InMemoryRunStore()
    const flow = buildFlow({
      nodes: [
        { id: 'trigger', type: 'test.trigger', label: 'Trigger' },
        { id: 'out', type: 'test.passthrough', label: 'Output' },
      ],
      edges: [{
        from: 'trigger',
        to: 'out',
        mappings: [
          { to: 'greeting', expr: '"Hello, " + upstream.name' },
          { to: 'doubled', expr: 'upstream.count * 2' },
        ],
      }],
      triggerId: 'trigger',
    })

    await executeRun({
      flow,
      revisionId: 'rev-1',
      runId: 'run-1',
      inputs: { name: 'World', count: 5 },
      store,
    })

    const outSnap = store.getSnapshot('run-1', 'out')
    expect(outSnap?.status).toBe('success')
    expect(outSnap?.input?.greeting).toBe('Hello, World')
    expect(outSnap?.input?.doubled).toBe(10)
  })

  test('supports nullish coalescing in expressions', async () => {
    registerNodeDefinition({
      type: 'test.passthrough',
      title: 'Passthrough',
      description: '',
      configSchema: z.object({}),
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}).passthrough(),
      costHint: 0,
      async run({ input }) { return { output: input } },
    })

    const store = new InMemoryRunStore()
    const flow = buildFlow({
      nodes: [
        { id: 'trigger', type: 'test.trigger', label: 'Trigger' },
        { id: 'out', type: 'test.passthrough', label: 'Output' },
      ],
      edges: [{
        from: 'trigger',
        to: 'out',
        mappings: [
          { to: 'value', expr: 'upstream.missing ?? "fallback"' },
        ],
      }],
      triggerId: 'trigger',
    })

    await executeRun({
      flow,
      revisionId: 'rev-1',
      runId: 'run-1',
      inputs: { other: 'data' },
      store,
    })

    const outSnap = store.getSnapshot('run-1', 'out')
    expect(outSnap?.input?.value).toBe('fallback')
  })
})
