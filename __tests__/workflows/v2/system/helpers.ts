/**
 * Shared test helpers for the system test suite.
 * Provides mock infrastructure for running action handlers without real APIs.
 */

import type { NodeRunSnapshot, Flow, Edge, LineageRecord } from '@/src/lib/workflows/builder/schema'
import type { RunStore, NodeRunSnapshotWithId, StoredRun } from '@/src/lib/workflows/builder/runner/execute'

// ─── InMemoryRunStore ───────────────────────────────────────────────────────

export class InMemoryRunStore implements RunStore {
  runs = new Map<string, { status: string; flowId: string; revisionId: string; inputs: any; globals: Record<string, any>; error?: any }>()
  snapshots = new Map<string, Map<string, NodeRunSnapshot>>()
  lineage: LineageRecord[] = []

  async beginRun({ runId, flow, revisionId, inputs, globals }: Parameters<RunStore['beginRun']>[0]) {
    this.runs.set(runId, { status: 'running', flowId: flow.id, revisionId, inputs, globals })
  }

  async completeRun({ runId }: Parameters<RunStore['completeRun']>[0]) {
    const run = this.runs.get(runId)
    if (run) run.status = 'success'
  }

  async failRun({ runId, error }: Parameters<RunStore['failRun']>[0]) {
    const run = this.runs.get(runId)
    if (run) { run.status = 'error'; run.error = error }
  }

  async recordNodeSnapshot({ runId, nodeId, snapshot }: Parameters<RunStore['recordNodeSnapshot']>[0]) {
    if (!this.snapshots.has(runId)) this.snapshots.set(runId, new Map())
    this.snapshots.get(runId)!.set(nodeId, snapshot)
  }

  async recordLineage(records: Parameters<RunStore['recordLineage']>[0]) {
    this.lineage.push(...records)
  }

  async loadRun(runId: string): Promise<StoredRun | null> {
    const run = this.runs.get(runId)
    if (!run) return null
    const nodeSnapshots: NodeRunSnapshotWithId[] = []
    const nodeMap = this.snapshots.get(runId)
    if (nodeMap) nodeMap.forEach((snapshot, nodeId) => nodeSnapshots.push({ ...snapshot, nodeId }))
    return { runId, flowId: run.flowId, revisionId: run.revisionId, inputs: run.inputs, globals: run.globals, nodeSnapshots }
  }

  getSnapshot(runId: string, nodeId: string): NodeRunSnapshot | undefined {
    return this.snapshots.get(runId)?.get(nodeId)
  }

  getAllSnapshots(runId: string): Map<string, NodeRunSnapshot> | undefined {
    return this.snapshots.get(runId)
  }
}

// ─── Flow Builder Helpers ───────────────────────────────────────────────────

interface SimpleNode {
  id: string
  type: string
  label: string
  config?: Record<string, any>
}

interface SimpleEdge {
  from: string
  to: string
  mappings: Array<{ to: string; expr: string; required?: boolean }>
}

/**
 * Build a Flow object from simple node/edge descriptions.
 * Reduces boilerplate in tests.
 */
export function buildFlow(opts: {
  id?: string
  name?: string
  nodes: SimpleNode[]
  edges: SimpleEdge[]
  triggerId?: string
}): Flow {
  const { id = 'test-flow', name = 'Test Flow', nodes, edges, triggerId } = opts

  return {
    id,
    name,
    version: 1,
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.label,
      config: n.config || {},
      inPorts: [],
      outPorts: [],
      io: { inputSchema: undefined, outputSchema: undefined },
      policy: { timeoutMs: 5000, retries: 0 },
      costHint: 0,
      metadata: {},
    })),
    edges: edges.map((e, i) => ({
      id: `edge-${i + 1}`,
      from: { nodeId: e.from },
      to: { nodeId: e.to },
      mappings: e.mappings.map((m, j) => ({
        id: `map-${i + 1}-${j + 1}`,
        to: m.to,
        expr: m.expr,
        required: m.required ?? true,
      })),
    })),
    trigger: triggerId
      ? { type: 'manual', nodeId: triggerId, enabled: true }
      : { type: 'manual', nodeId: nodes[0]?.id || 'trigger', enabled: true },
    interface: { inputs: [], outputs: [] },
    globals: {},
  } as Flow
}

// ─── Action Result type ─────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean
  output?: any
  message?: string
  error?: string
}

// ─── Mock API Response Helpers ──────────────────────────────────────────────

/** Create a successful JSON mock response */
export function mockJsonResponse(data: any, status = 200) {
  return JSON.stringify(data)
}

/** Create a Slack-style API response */
export function mockSlackResponse(ok: boolean, data: Record<string, any> = {}) {
  return JSON.stringify({ ok, ...data })
}

/** Create a Discord-style API response */
export function mockDiscordResponse(data: Record<string, any>) {
  return JSON.stringify(data)
}

/** Create a Google API-style response */
export function mockGoogleResponse(data: Record<string, any>) {
  return JSON.stringify(data)
}
