/**
 * Tests for computeCostPreview — the server-authoritative cost computation.
 *
 * Loop membership detection is the highest-risk area.
 * These tests must all pass before ENABLE_LOOP_COST_EXPANSION can be enabled.
 */

import { computeCostPreview } from '@/lib/workflows/cost-preview'

// ── Helpers ──────────────────────────────────────────────────────────────

function makeNode(id: string, opts: {
  type?: string
  isTrigger?: boolean
  providerId?: string
  model?: string
  isPlaceholder?: boolean
  maxIterations?: number
} = {}) {
  return {
    id,
    type: opts.type ?? 'action',
    data: {
      type: opts.type ?? 'action',
      label: id,
      isTrigger: opts.isTrigger ?? false,
      isPlaceholder: opts.isPlaceholder ?? false,
      providerId: opts.providerId ?? 'slack',
      config: {
        ...(opts.model ? { model: opts.model } : {}),
        ...(opts.maxIterations != null ? { maxIterations: opts.maxIterations } : {}),
      },
    },
  }
}

function makeTrigger(id: string) {
  return makeNode(id, { type: 'gmail_trigger_new_email', isTrigger: true })
}

function makeLoop(id: string, maxIterations = 10) {
  return makeNode(id, { type: 'loop', providerId: 'logic', maxIterations })
}

function makeAction(id: string, providerId = 'slack') {
  return makeNode(id, { type: `${providerId}_action`, providerId })
}

function makeAIAction(id: string, model = 'gpt-4o-mini') {
  return makeNode(id, { type: 'ai_agent', providerId: 'openai', model })
}

function edge(source: string, target: string) {
  return { source, target }
}

// ── Basic cost computation ───────────────────────────────────────────────

describe('computeCostPreview', () => {
  describe('flat cost (no loops)', () => {
    it('returns zero for empty workflow', () => {
      const result = computeCostPreview([], [])
      expect(result.flatCost).toBe(0)
      expect(result.totalCost).toBe(0)
      expect(result.hasLoops).toBe(false)
      expect(result.loopDetails).toHaveLength(0)
    })

    it('excludes triggers from cost', () => {
      const nodes = [makeTrigger('t1'), makeAction('a1')]
      const edges = [edge('t1', 'a1')]
      const result = computeCostPreview(nodes, edges)
      expect(result.flatCost).toBe(1)
      expect(result.breakdown).toEqual({ a1: 1 })
    })

    it('sums standard action costs', () => {
      const nodes = [
        makeTrigger('t1'),
        makeAction('a1', 'slack'),
        makeAction('a2', 'gmail'),
        makeAction('a3', 'stripe'),
      ]
      const edges = [edge('t1', 'a1'), edge('a1', 'a2'), edge('a2', 'a3')]
      const result = computeCostPreview(nodes, edges)
      expect(result.flatCost).toBe(3)
      expect(result.totalCost).toBe(3)
    })

    it('applies AI model pricing', () => {
      const nodes = [
        makeTrigger('t1'),
        makeAIAction('ai1', 'gpt-4o-mini'),  // 2 tasks
        makeAIAction('ai2', 'claude-3-opus'), // 5 tasks
      ]
      const edges = [edge('t1', 'ai1'), edge('ai1', 'ai2')]
      const result = computeCostPreview(nodes, edges)
      expect(result.flatCost).toBe(7)
    })

    it('skips placeholder nodes', () => {
      const nodes = [
        makeAction('a1'),
        makeNode('p1', { isPlaceholder: true }),
      ]
      const result = computeCostPreview(nodes, [])
      expect(result.flatCost).toBe(1)
    })

    it('logic nodes are free', () => {
      const nodes = [
        makeAction('a1'),
        makeNode('f1', { type: 'filter', providerId: 'logic' }),
        makeNode('d1', { type: 'delay', providerId: 'delay' }),
      ]
      const result = computeCostPreview(nodes, [])
      expect(result.flatCost).toBe(1)
    })
  })

  // ── Single loop ──────────────────────────────────────────────────────

  describe('single loop', () => {
    it('expands inner node cost by max iterations', () => {
      const nodes = [
        makeTrigger('t1'),
        makeLoop('loop1', 5),
        makeAction('a1'),
        makeAction('a2'),
      ]
      const edges = [
        edge('t1', 'loop1'),
        edge('loop1', 'a1'),
        edge('a1', 'a2'),
      ]
      const result = computeCostPreview(nodes, edges)

      // Flat: a1(1) + a2(1) = 2  (loop node itself is logic = 0)
      expect(result.flatCost).toBe(2)

      // Total: 2 inner nodes x 5 iterations = 10
      expect(result.totalCost).toBe(10)
      expect(result.hasLoops).toBe(true)
      expect(result.loopDetails).toHaveLength(1)
      expect(result.loopDetails[0]).toEqual({
        loopNodeId: 'loop1',
        innerNodeIds: expect.arrayContaining(['a1', 'a2']),
        innerCost: 2,
        maxIterations: 5,
        expandedCost: 10,
      })
    })

    it('uses default 10 iterations when not configured', () => {
      const loopNode = makeLoop('loop1')
      // Remove explicit maxIterations config
      loopNode.data.config = {}

      const nodes = [loopNode, makeAction('a1')]
      const edges = [edge('loop1', 'a1')]
      const result = computeCostPreview(nodes, edges)

      expect(result.totalCost).toBe(10) // 1 action x 10 default iterations
    })

    it('caps at 500 iterations', () => {
      const nodes = [makeLoop('loop1', 9999), makeAction('a1')]
      const edges = [edge('loop1', 'a1')]
      const result = computeCostPreview(nodes, edges)

      expect(result.totalCost).toBe(500) // 1 action x 500 cap
    })
  })

  // ── Empty loop ───────────────────────────────────────────────────────

  describe('empty loop', () => {
    it('loop with no inner nodes produces zero expansion', () => {
      const nodes = [makeTrigger('t1'), makeLoop('loop1', 10)]
      const edges = [edge('t1', 'loop1')]
      const result = computeCostPreview(nodes, edges)

      expect(result.flatCost).toBe(0)
      expect(result.totalCost).toBe(0)
      expect(result.hasLoops).toBe(true)
      expect(result.loopDetails).toHaveLength(1)
      expect(result.loopDetails[0].innerNodeIds).toHaveLength(0)
      expect(result.loopDetails[0].expandedCost).toBe(0)
    })

    it('loop with no outgoing edges produces zero expansion', () => {
      const nodes = [makeLoop('loop1', 10), makeAction('a1')]
      // a1 is not connected to loop1
      const edges: { source: string; target: string }[] = []
      const result = computeCostPreview(nodes, edges)

      expect(result.hasLoops).toBe(true)
      expect(result.loopDetails[0].innerNodeIds).toHaveLength(0)
    })
  })

  // ── Sibling loops ────────────────────────────────────────────────────

  describe('sibling (independent) loops', () => {
    it('each loop expands independently', () => {
      const nodes = [
        makeTrigger('t1'),
        makeLoop('loopA', 3),
        makeAction('a1'),  // inside loopA
        makeLoop('loopB', 5),
        makeAction('a2'),  // inside loopB
      ]
      const edges = [
        edge('t1', 'loopA'),
        edge('loopA', 'a1'),
        edge('t1', 'loopB'),
        edge('loopB', 'a2'),
      ]
      const result = computeCostPreview(nodes, edges)

      // Flat: a1(1) + a2(1) = 2
      expect(result.flatCost).toBe(2)

      // Total: a1*3 + a2*5 = 3 + 5 = 8
      expect(result.totalCost).toBe(8)
      expect(result.loopDetails).toHaveLength(2)
    })
  })

  // ── Nested loops ─────────────────────────────────────────────────────

  describe('nested loops', () => {
    it('outer loop counts inner loop at flat cost (inner loop has its own expansion)', () => {
      // Structure: trigger -> outerLoop -> innerLoop -> action
      const nodes = [
        makeTrigger('t1'),
        makeLoop('outer', 3),
        makeLoop('inner', 4),
        makeAction('a1'),
      ]
      const edges = [
        edge('t1', 'outer'),
        edge('outer', 'inner'),
        edge('inner', 'a1'),
      ]
      const result = computeCostPreview(nodes, edges)

      // Flat: a1 = 1 (both loops are logic = 0)
      expect(result.flatCost).toBe(1)

      // The outer loop has 'inner' as an inner node (loop nodes are at flat cost = 0)
      // The inner loop has 'a1' as an inner node
      expect(result.loopDetails).toHaveLength(2)

      const outerDetail = result.loopDetails.find(d => d.loopNodeId === 'outer')!
      const innerDetail = result.loopDetails.find(d => d.loopNodeId === 'inner')!

      // Inner loop: a1(1) x 4 = 4
      expect(innerDetail.innerCost).toBe(1)
      expect(innerDetail.expandedCost).toBe(4)

      // Outer loop: inner(0, it's a loop/logic node) x 3 = 0
      // The outer loop sees the inner loop node at flat cost (0 for logic)
      expect(outerDetail.innerNodeIds).toContain('inner')
      expect(outerDetail.innerCost).toBe(0) // inner loop node is logic = 0
      expect(outerDetail.expandedCost).toBe(0)

      // Total = flat(1) + innerExpansionDelta(4-1=3) + outerExpansionDelta(0-0=0) = 4
      expect(result.totalCost).toBe(4)
    })
  })

  // ── Malformed graphs ─────────────────────────────────────────────────

  describe('malformed graphs', () => {
    it('handles cycles without infinite loop', () => {
      const nodes = [
        makeLoop('loop1', 5),
        makeAction('a1'),
        makeAction('a2'),
      ]
      // a2 -> a1 creates a cycle
      const edges = [
        edge('loop1', 'a1'),
        edge('a1', 'a2'),
        edge('a2', 'a1'), // cycle
      ]
      const result = computeCostPreview(nodes, edges)

      // Should not infinite loop, should detect both inner nodes
      expect(result.hasLoops).toBe(true)
      expect(result.loopDetails[0].innerNodeIds).toHaveLength(2)
    })

    it('handles nodes with no id gracefully', () => {
      const nodes = [
        makeAction('a1'),
        { id: null, data: {} } as any,
        null as any,
      ]
      const result = computeCostPreview(nodes, [])
      expect(result.flatCost).toBe(1)
    })

    it('handles edges with missing source/target', () => {
      const nodes = [makeLoop('loop1', 5), makeAction('a1')]
      const edges = [
        { source: '', target: 'a1' },
        { source: 'loop1', target: '' },
        edge('loop1', 'a1'),
      ]
      const result = computeCostPreview(nodes, edges)

      expect(result.loopDetails[0].innerNodeIds).toContain('a1')
    })

    it('orphan nodes outside any loop counted at flat cost', () => {
      const nodes = [
        makeLoop('loop1', 5),
        makeAction('a1'),  // inside loop
        makeAction('a2'),  // orphan, not connected
      ]
      const edges = [edge('loop1', 'a1')]
      const result = computeCostPreview(nodes, edges)

      // a1 is inside loop, a2 is orphan
      expect(result.flatCost).toBe(2) // a1 + a2
      // Total: a1*5 + a2 = 5 + 1 = 6 (delta = 5-1 = 4, plus flat 2 = 6)
      expect(result.totalCost).toBe(6)
    })
  })

  // ── Mixed workflows ──────────────────────────────────────────────────

  describe('mixed workflows', () => {
    it('loop with AI actions inside uses correct model pricing', () => {
      const nodes = [
        makeTrigger('t1'),
        makeLoop('loop1', 3),
        makeAIAction('ai1', 'claude-3-opus'), // 5 tasks
        makeAction('a1'),                      // 1 task
      ]
      const edges = [
        edge('t1', 'loop1'),
        edge('loop1', 'ai1'),
        edge('ai1', 'a1'),
      ]
      const result = computeCostPreview(nodes, edges)

      expect(result.flatCost).toBe(6)  // 5 + 1
      expect(result.totalCost).toBe(18) // (5+1) * 3
    })

    it('actions before and after loop counted correctly', () => {
      const nodes = [
        makeTrigger('t1'),
        makeAction('before'),
        makeLoop('loop1', 5),
        makeAction('inner'),
        makeAction('after'),
      ]
      const edges = [
        edge('t1', 'before'),
        edge('before', 'loop1'),
        edge('loop1', 'inner'),
        edge('inner', 'after'), // after is reachable from loop
      ]
      const result = computeCostPreview(nodes, edges)

      // Flat: before(1) + inner(1) + after(1) = 3
      expect(result.flatCost).toBe(3)

      // inner and after are both inside loop (reachable from loop1)
      // Total: before(1) + (inner+after)*5 = 1 + 10 = 11
      // Delta = 10 - 2 = 8, total = 3 + 8 = 11
      expect(result.totalCost).toBe(11)
    })
  })

  // ── Parity invariant ─────────────────────────────────────────────────

  describe('parity invariant', () => {
    it('flatCost equals totalCost when no loops present', () => {
      const nodes = [
        makeTrigger('t1'),
        makeAction('a1'),
        makeAction('a2'),
        makeAction('a3'),
      ]
      const edges = [edge('t1', 'a1'), edge('a1', 'a2'), edge('a2', 'a3')]
      const result = computeCostPreview(nodes, edges)

      expect(result.flatCost).toBe(result.totalCost)
      expect(result.hasLoops).toBe(false)
    })

    it('totalCost >= flatCost always', () => {
      const nodes = [
        makeLoop('loop1', 1), // even with 1 iteration
        makeAction('a1'),
      ]
      const edges = [edge('loop1', 'a1')]
      const result = computeCostPreview(nodes, edges)

      expect(result.totalCost).toBeGreaterThanOrEqual(result.flatCost)
    })
  })
})
