import { randomUUID } from "crypto"

import { buildDownstreamInput } from "../mapping"
import {
  Flow,
  FlowSchema,
  LineageRecordSchema,
  Node,
  NodeRunSnapshotSchema,
  type LineageRecord,
  type NodeRunSnapshot,
  type RunContext,
  RunContextSchema,
} from "../schema"
import { FlowRepository } from "../repo"
import { topologicalPlan } from "./plan"
import { getRunner, type NodeRunner } from "./registry"
import { createSupabaseServiceClient } from "@/utils/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateCostSummary, type NodeCostInput } from "../costing"
import { redactSecrets, resolveConfigSecrets } from "../secrets"
import { createNodeLogger } from "../logging"

type CostSummaryResult = ReturnType<typeof calculateCostSummary>

export interface RunStore {
  beginRun(input: {
    runId: string
    flow: Flow
    revisionId: string
    inputs: any
    globals: Record<string, any>
    startedAt: string
    isResume?: boolean
  }): Promise<void>
  completeRun(input: { runId: string; finishedAt: string; costSummary: CostSummaryResult }): Promise<void>
  failRun(input: { runId: string; finishedAt: string; error: any; costSummary: CostSummaryResult }): Promise<void>
  recordNodeSnapshot(input: {
    runId: string
    nodeId: string
    snapshot: NodeRunSnapshot
  }): Promise<void>
  recordLineage(records: LineageRecord[]): Promise<void>
  loadRun?(runId: string): Promise<StoredRun | null>
}

export interface StoredRun {
  runId: string
  flowId: string
  revisionId: string
  inputs: any
  globals: Record<string, any>
  nodeSnapshots: NodeRunSnapshotWithId[]
}

export interface NodeRunSnapshotWithId extends NodeRunSnapshot {
  nodeId: string
}

export interface ExecuteRunOptions {
  flow: Flow
  revisionId: string
  runId: string
  inputs: any
  globals?: Record<string, any>
  store?: RunStore
  resumeFromNodeId?: string
  initialSnapshots?: Record<string, NodeRunSnapshotWithId>
  isResume?: boolean
}

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_RETRIES = 2

export async function executeRun(options: ExecuteRunOptions): Promise<void> {
  const {
    flow,
    revisionId,
    runId,
    inputs,
    globals = {},
    store: providedStore,
    resumeFromNodeId,
    initialSnapshots = {},
    isResume = false,
  } = options

  const store = providedStore ?? (await createDefaultRunStore())

  FlowSchema.parse(flow)

  const runContext: RunContext = RunContextSchema.parse({
    flowId: flow.id,
    runId,
    revisionId,
    status: "running",
    startedAt: new Date().toISOString(),
    inputs,
    globals,
    nodeOutputs: {},
    lineage: [],
    errors: [],
  })

  await store.beginRun({
    runId,
    flow,
    revisionId,
    inputs,
    globals,
    startedAt: runContext.startedAt,
    isResume,
  })

  // Seed initial node snapshots when resuming from an existing run
  for (const [nodeId, snapshot] of Object.entries(initialSnapshots)) {
    runContext.nodeOutputs[nodeId] = NodeRunSnapshotSchema.parse(snapshot)
    await store.recordNodeSnapshot({ runId, nodeId, snapshot })
  }

  const plan = topologicalPlan(flow)
  const { stageIndex: resumeStageIndex, nodeIndex: resumeNodeIndex } = locateNodeInPlan(plan, resumeFromNodeId)

  let failed = false
  let failureError: any = null

  const costInputs: NodeCostInput[] = []

  try {
    for (let stageIdx = 0; stageIdx < plan.length; stageIdx++) {
      const stage = plan[stageIdx]

      if (stageIdx < resumeStageIndex) {
        continue
      }

      const nodesToRun = stage.filter((node, index) => {
        if (stageIdx === resumeStageIndex && resumeNodeIndex >= 0) {
          return index >= resumeNodeIndex
        }
        return true
      })

      if (nodesToRun.length === 0) {
        continue
      }

      const stageResults = await Promise.all(
        nodesToRun.map((node) =>
          runNode({
            flow,
            node,
            runContext,
            runId,
            inputs,
            store,
            costInputs,
          })
        )
      )

      for (const result of stageResults) {
        if (result.snapshot) {
          runContext.nodeOutputs[result.nodeId] = result.snapshot
        }
        if (result.lineage.length > 0) {
          runContext.lineage.push(...result.lineage)
          await store.recordLineage(result.lineage)
        }
        if (result.error) {
          runContext.errors.push(result.error)
          failed = true
          failureError = result.error
        }
      }

      if (failed) {
        break
      }
    }
  } catch (error) {
    failed = true
    failureError = serializeError(error)
  }

  const finishedAt = new Date().toISOString()

  const costSummary = calculateCostSummary(costInputs)
  runContext.estimatedCost = costSummary.estimated
  runContext.actualCost = costSummary.actual
  runContext.costBreakdown = costSummary.breakdown

  if (failed) {
    await store.failRun({ runId, finishedAt, error: failureError, costSummary })
  } else {
    await store.completeRun({ runId, finishedAt, costSummary })
  }
}

export async function runFromHere(options: {
  store?: RunStore
  repository?: FlowRepository
  runId: string
  startNodeId: string
  newRunId?: string
}): Promise<string> {
  const { store: providedStore, repository, runId, startNodeId, newRunId = randomUUID() } = options

  const store = providedStore ?? (await createDefaultRunStore())
  if (!store.loadRun) {
    throw new Error("Run store does not support loading runs")
  }
  if (!repository) {
    throw new Error("FlowRepository instance is required to resume runs")
  }

  const stored = await store.loadRun(runId)
  if (!stored) {
    throw new Error(`Run ${runId} not found`)
  }

  const revision = await repository.loadRevisionById(stored.revisionId)
  if (!revision) {
    throw new Error(`Revision ${stored.revisionId} not found`)
  }

  const snapshotMap: Record<string, NodeRunSnapshotWithId> = {}
  for (const snapshot of stored.nodeSnapshots) {
    if (snapshot.status === "success" || snapshot.status === "skipped") {
      snapshotMap[snapshot.nodeId] = snapshot
    }
  }

  await executeRun({
    flow: revision.graph,
    revisionId: revision.id,
    runId: newRunId,
    inputs: stored.inputs,
    globals: stored.globals,
    store,
    resumeFromNodeId: startNodeId,
    initialSnapshots: snapshotMap,
    isResume: true,
  })

  return newRunId
}

async function runNode({
  flow,
  node,
  runContext,
  runId,
  inputs,
  store,
  costInputs,
}: {
  flow: Flow
  node: Node
  runContext: RunContext
  runId: string
  inputs: any
  store: RunStore
  costInputs: NodeCostInput[]
}): Promise<{
  nodeId: string
  snapshot?: NodeRunSnapshot
  lineage: LineageRecord[]
  error?: any
}> {
  const inboundEdges = flow.edges.filter((edge) => edge.to.nodeId === node.id)
  const nodeOutputsForContext: Record<string, any> = {}
  Object.entries(runContext.nodeOutputs).forEach(([nodeId, snapshot]) => {
    if (snapshot && typeof snapshot === "object" && "output" in snapshot) {
      nodeOutputsForContext[nodeId] = (snapshot as NodeRunSnapshot).output
    }
  })

  let accumulatedInput = inboundEdges.length === 0 ? clone(inputs ?? {}) : {}
  const lineage: LineageRecord[] = []

  for (const edge of inboundEdges) {
    const upstreamOutput = nodeOutputsForContext[edge.from.nodeId]
    const { value, lineage: edgeLineage } = await buildDownstreamInput({
      edge,
      ctx: {
        inputs: inputs ?? {},
        globals: runContext.globals ?? {},
        nodeOutputs: nodeOutputsForContext,
        upstream: upstreamOutput,
      },
      toNodeId: node.id,
      runId,
    })
    accumulatedInput = deepMerge(accumulatedInput, value)
    lineage.push(...edgeLineage.map((record) => LineageRecordSchema.parse(record)))
  }

  const startedAt = new Date().toISOString()

  try {
    const snapshot = await executeNodeWithRetry({
      node,
      input: accumulatedInput,
      runId,
      globals: runContext.globals ?? {},
      costInputs,
      workspaceId: (flow.metadata as any)?.workspaceId,
    })

    const parsedSnapshot = NodeRunSnapshotSchema.parse({
      ...snapshot,
      nodeId: node.id,
      input: accumulatedInput,
      startedAt,
      finishedAt: new Date().toISOString(),
    })

    await store.recordNodeSnapshot({
      runId,
      nodeId: node.id,
      snapshot: parsedSnapshot,
    })

    return { nodeId: node.id, snapshot: parsedSnapshot, lineage }
  } catch (error) {
    const serializedError = serializeError(error)
    const errorSnapshot = NodeRunSnapshotSchema.parse({
      nodeId: node.id,
      status: "error",
      input: accumulatedInput,
      error: serializedError,
      attempts: serializedError.attempts ?? 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: serializedError.durationMs,
    })

    await store.recordNodeSnapshot({
      runId,
      nodeId: node.id,
      snapshot: errorSnapshot,
    })

    return { nodeId: node.id, snapshot: errorSnapshot, lineage, error: serializedError }
  }
}

async function executeNodeWithRetry({
  node,
  input,
  runId,
  globals,
  costInputs,
  workspaceId,
}: {
  node: Node
  input: any
  runId: string
  globals: Record<string, any>
  costInputs: NodeCostInput[]
  workspaceId?: string
}): Promise<NodeRunSnapshot> {
  const policy = {
    timeoutMs: node.policy?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: node.policy?.retries ?? DEFAULT_RETRIES,
    retryDelayMs: node.policy?.retryDelayMs ?? 1000,
  }

  const runner = getRunner(node.type)

  let attempt = 0
  const attemptStart = Date.now()
  let lastError: any
  let lastSecretValues: string[] = []

  while (attempt <= policy.retries) {
    attempt++
    const startedAt = Date.now()
    try {
      const { resolved: resolvedConfig, secretValues } = await resolveConfigSecrets(node.config ?? {}, workspaceId)
      lastSecretValues = secretValues
      const result = await withTimeout(policy.timeoutMs, () =>
        runner({
          input,
          config: resolvedConfig ?? {},
          ctx: { runId, globals, nodeId: node.id, attempt },
        })
      )
      const finishedAt = Date.now()
      const durationMs = finishedAt - startedAt

      costInputs.push({
        node,
        actual: result.cost ?? 0,
        estimated: node.costHint ?? 0,
        tokenCount: (result as any).tokens ?? undefined,
      })

      return NodeRunSnapshotSchema.parse({
        nodeId: node.id,
        status: "success",
        input: redactSecrets(input, secretValues),
        output: redactSecrets(result.output, secretValues),
        estimatedCost: node.costHint ?? 0,
        cost: result.cost,
        tokenCount: (result as any).tokens,
        attempts: attempt,
        durationMs,
      })
    } catch (error) {
      lastError = serializeError(error)
      if (attempt > policy.retries) {
        break
      }
      const delayMs = computeBackoff(attempt, policy.retryDelayMs)
      await delay(delayMs)
    }
  }

  const durationMs = Date.now() - attemptStart
  const errorSnapshot = NodeRunSnapshotSchema.parse({
    nodeId: node.id,
    status: "error",
    input: redactSecrets(input, lastSecretValues),
    error: redactSecrets(lastError, lastSecretValues),
    attempts: attempt,
    durationMs,
    estimatedCost: node.costHint ?? 0,
  })

  const enrichedError = new Error(lastError?.message ?? "Node execution failed")
  Object.assign(enrichedError, lastError, {
    attempts: attempt,
    durationMs,
  })
  throw enrichedError
}

function computeBackoff(attempt: number, baseDelay: number): number {
  const delay = Math.pow(attempt, 2) * baseDelay
  if (process.env.NODE_ENV === "test") {
    return Math.min(delay, 5)
  }
  return delay
}

async function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  let timeoutHandle: NodeJS.Timeout
  return await Promise.race([
    fn().finally(() => clearTimeout(timeoutHandle)),
    new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("Node execution timed out"))
      }, ms)
    }),
  ])
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return
  }
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function locateNodeInPlan(plan: Array<Array<Node>>, nodeId?: string): { stageIndex: number; nodeIndex: number } {
  if (!nodeId) {
    return { stageIndex: 0, nodeIndex: -1 }
  }

  for (let stageIdx = 0; stageIdx < plan.length; stageIdx++) {
    const stage = plan[stageIdx]
    const nodeIndex = stage.findIndex((node) => node.id === nodeId)
    if (nodeIndex >= 0) {
      return { stageIndex: stageIdx, nodeIndex }
    }
  }

  return { stageIndex: 0, nodeIndex: -1 }
}

function deepMerge(target: any, source: any): any {
  if (target == null) {
    return clone(source)
  }
  if (source == null) {
    return target
  }
  if (Array.isArray(target) && Array.isArray(source)) {
    return [...target, ...source]
  }
  if (typeof target !== "object" || typeof source !== "object") {
    return clone(source)
  }

  const output: Record<string, any> = { ...target }
  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = deepMerge(target[key], value)
    } else {
      output[key] = clone(value)
    }
  })
  return output
}

function clone<T>(value: T): T {
  if (value == null) {
    return value
  }
  return JSON.parse(JSON.stringify(value))
}

function serializeError(error: any): any {
  if (!error) {
    return { type: "Error", message: "Unknown error" }
  }

  if (typeof error === "string") {
    return { type: "Error", message: error }
  }

  const base: any = {
    type: error.type || error.name || "Error",
    message: error.message || "Unknown error",
  }

  if (error.stack) {
    base.stack = String(error.stack)
  }

  const extra = { ...error }
  delete extra.type
  delete extra.message
  delete extra.stack

  if (Object.keys(extra).length > 0) {
    base.data = extra
  }

  return base
}

async function createDefaultRunStore(): Promise<RunStore> {
  const client = await createSupabaseServiceClient()
  return createSupabaseRunStore(client)
}

export function createSupabaseRunStore(client: SupabaseClient<any>): RunStore {
  const logNodeEvent = createNodeLogger(client)

  return {
    async beginRun({ runId, flow, revisionId, inputs, globals, startedAt, isResume }) {
      await client.from("workflow_executions").upsert({
        id: runId,
        workflow_id: flow.id,
        user_id: flow.metadata?.userId ?? flow.metadata?.createdBy ?? "system",
        status: "running",
        input_data: inputs,
        output_data: null,
        started_at: startedAt,
        completed_at: null,
        error_message: null,
        execution_time_ms: null,
      })
    },

    async completeRun({ runId, finishedAt, costSummary }) {
      const { data: run } = await client
        .from("workflow_executions")
        .select("started_at")
        .eq("id", runId)
        .single()

      const executionTimeMs = run?.started_at
        ? new Date(finishedAt).getTime() - new Date(run.started_at).getTime()
        : null

      await client
        .from("workflow_executions")
        .update({
          status: "success",
          completed_at: finishedAt,
          execution_time_ms: executionTimeMs,
        })
        .eq("id", runId)
    },

    async failRun({ runId, finishedAt, error, costSummary }) {
      const { data: run } = await client
        .from("workflow_executions")
        .select("started_at")
        .eq("id", runId)
        .single()

      const executionTimeMs = run?.started_at
        ? new Date(finishedAt).getTime() - new Date(run.started_at).getTime()
        : null

      await client
        .from("workflow_executions")
        .update({
          status: "error",
          completed_at: finishedAt,
          error_message: JSON.stringify(error),
          execution_time_ms: executionTimeMs,
        })
        .eq("id", runId)
    },

    async recordNodeSnapshot({ runId, nodeId, snapshot }) {
      const payload = {
        id: `${runId}:${nodeId}`,
        execution_id: runId,
        node_id: nodeId,
        node_type: snapshot.nodeId ?? "unknown",
        status: snapshot.status,
        input_data: snapshot.input,
        output_data: snapshot.output,
        error_message: snapshot.error ? JSON.stringify(snapshot.error) : null,
        started_at: snapshot.startedAt ?? new Date().toISOString(),
        completed_at: snapshot.finishedAt ?? new Date().toISOString(),
      }
      await client.from("workflow_node_executions").upsert(payload)

      try {
        await logNodeEvent({
          runId,
          nodeId,
          status: snapshot.status ?? "success",
          latencyMs: snapshot.durationMs ?? null,
          cost: snapshot.cost ?? null,
          retries: snapshot.attempts ?? null,
        })
      } catch (error) {
        console.error("[Workflow] Failed to record node log", { runId, nodeId, error })
      }
    },

    async recordLineage(records) {
      // Lineage tracking is not supported in current schema
      // Could be added to workflow_node_executions as metadata if needed
      return
    },

    async loadRun(runId) {
      const { data: run } = await client
        .from("workflow_executions")
        .select("id, workflow_id, user_id, input_data")
        .eq("id", runId)
        .maybeSingle()

      if (!run) {
        return null
      }

      const { data: nodes } = await client
        .from("workflow_node_executions")
        .select("node_id, status, input_data, output_data, error_message, started_at, completed_at")
        .eq("execution_id", runId)

      return {
        runId,
        flowId: run.workflow_id,
        revisionId: "unknown", // Not stored in workflow_executions table
        inputs: run.input_data,
        globals: {},
        nodeSnapshots:
          nodes?.map((row) =>
            NodeRunSnapshotSchema.parse({
              nodeId: row.node_id,
              status: row.status,
              input: row.input_data,
              output: row.output_data,
              error: row.error_message ? JSON.parse(row.error_message) : undefined,
              attempts: 0,
              durationMs: row.started_at && row.completed_at
                ? new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()
                : 0,
            })
          ) ?? [],
      }
    },
  }
}
