"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Edge as ReactFlowEdge, Node as ReactFlowNode, XYPosition } from "@xyflow/react"

import { useWorkflowBuilder } from "@/hooks/workflows/useWorkflowBuilder"
import { FlowSchema, type Flow, type FlowInterface, type Node as FlowNode, type Edge as FlowEdge } from "./schema"
import { addNodeEdit, oldConnectToEdge } from "../compat/v2Adapter"

export interface UseFlowV2BuilderOptions {
  initialPrompt?: string
  autoOpenAgentPanel?: boolean
}

type PlannerEdit =
  | { op: "addNode"; node: FlowNode }
  | { op: "connect"; edge: FlowEdge }
  | { op: "setConfig"; nodeId: string; patch: Record<string, any> }
  | { op: "setInterface"; inputs: FlowInterface["inputs"]; outputs: FlowInterface["outputs"] }

interface AgentResult {
  edits: PlannerEdit[]
  prerequisites: string[]
  rationale?: string
  workflowName?: string
}

interface RunNodeSnapshot {
  node_id: string
  status: string
  input: any
  output: any
  error: any
  attempts: number
  duration_ms: number | null
  cost: number | null
  estimated_cost: number | null
  token_count: number | null
  created_at: string
}

interface RunLogEntry {
  id: string
  node_id: string
  status: string
  latency_ms: number | null
  cost: number | null
  retries: number | null
  created_at: string
}

interface RunSummary {
  totalDurationMs: number
  totalCost: number
  successCount: number
  errorCount: number
  pendingCount: number
  startedAt: string | null
  finishedAt: string | null
}

interface RunDetails {
  id: string
  status: string
  nodes: RunNodeSnapshot[]
  logs: RunLogEntry[]
  summary: RunSummary
}

interface NodeSnapshotResult {
  snapshot?: any
  lineage: any[]
}

interface FlowV2BuilderState {
  flowId: string
  flow: Flow | null
  revisionId?: string
  version?: number
  isLoading: boolean
  isSaving: boolean
  error?: string
  lastAgentPrompt?: string
  agentRationale?: string
  agentPrerequisites: string[]
  pendingAgentEdits: PlannerEdit[]
  lastRunId?: string
  runs: Record<string, RunDetails>
  nodeSnapshots: Record<string, NodeSnapshotResult>
  secrets: Array<{ id: string; name: string }>
}

export interface FlowV2BuilderActions {
  load: () => Promise<void>
  applyEdits: (edits: PlannerEdit[]) => Promise<Flow>
  askAgent: (prompt: string) => Promise<AgentResult>
  updateConfig: (nodeId: string, patch: Record<string, any>) => void
  updateFlowName: (name: string) => Promise<void>
  addNode: (type: string, position?: XYPosition) => Promise<void>
  connectEdge: (params: { sourceId: string; targetId: string; sourceHandle?: string; targetHandle?: string }) => Promise<void>
  run: (inputs: any) => Promise<{ runId: string }>
  runFromHere: (nodeId: string, runId?: string) => Promise<{ runId: string }>
  refreshRun: (runId?: string) => Promise<RunDetails | null>
  getNodeSnapshot: (nodeId: string, runId?: string) => Promise<NodeSnapshotResult | null>
  listSecrets: () => Promise<Array<{ id: string; name: string }>>
  createSecret: (name: string, value: string, workspaceId?: string) => Promise<{ id: string; name: string }>
  estimate: () => Promise<any | null>
  publish: () => Promise<{ revisionId: string }>
}

interface UseFlowV2BuilderResult extends ReturnType<typeof useWorkflowBuilder> {
  flowState: FlowV2BuilderState
  actions: FlowV2BuilderActions
}

const JSON_HEADERS = { "Content-Type": "application/json" }

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(text || `Request failed (${response.status})`)
  }

  return (await response.json()) as T
}

function cloneFlow(flow: Flow): Flow {
  return JSON.parse(JSON.stringify(flow)) as Flow
}

function applyPlannerEdits(base: Flow, edits: PlannerEdit[]): Flow {
  const working = cloneFlow(base)

  for (const edit of edits) {
    switch (edit.op) {
      case "addNode": {
        const exists = working.nodes.find((node) => node.id === edit.node.id)
        if (!exists) {
          working.nodes.push(edit.node)
        }
        break
      }
      case "connect": {
        const key = `${edit.edge.from.nodeId}->${edit.edge.to.nodeId}`
        const exists = working.edges.find((edge) => `${edge.from.nodeId}->${edge.to.nodeId}` === key)
        if (!exists) {
          working.edges.push(edit.edge)
        }
        break
      }
      case "setConfig": {
        const target = working.nodes.find((node) => node.id === edit.nodeId)
        if (target) {
          target.config = {
            ...(target.config ?? {}),
            ...edit.patch,
          }
          const metadata = (target.metadata ?? {}) as any
          const highlights = new Set<string>(metadata.agentHighlights ?? [])
          Object.keys(edit.patch ?? {}).forEach((key) => highlights.add(key))
          metadata.agentHighlights = Array.from(highlights)
          target.metadata = metadata
        }
        break
      }
      case "setInterface": {
        const existing = working.interface ?? { inputs: [], outputs: [] }
        working.interface = {
          ...existing,
          inputs: edit.inputs ?? existing.inputs,
          outputs: edit.outputs ?? existing.outputs,
        }
        break
      }
      default: {
        const exhaustive: never = edit
        throw new Error(`Unhandled edit operation: ${(exhaustive as any)?.op}`)
      }
    }
  }

  working.version = (working.version ?? 0) + 1
  return working
}

function flowToReactFlowNodes(flow: Flow): ReactFlowNode[] {
  return flow.nodes.map((node, index) => {
    const metadata = (node.metadata ?? {}) as any
    const position = metadata.position ?? {
      x: 120 + index * 260,
      y: 120,
    }

    return {
      id: node.id,
      type: metadata.reactFlowType ?? "custom",
      position,
      data: {
        label: node.label ?? node.type,
        title: node.label ?? node.type,
        type: node.type,
        config: node.config ?? {},
        description: node.description,
        isTrigger: metadata.isTrigger ?? false,
        agentHighlights: metadata.agentHighlights ?? [],
        costHint: node.costHint ?? 0,
      },
    } as ReactFlowNode
  })
}

function flowToReactFlowEdges(flow: Flow): ReactFlowEdge[] {
  return flow.edges.map((edge) => ({
    id: edge.id,
    source: edge.from.nodeId,
    target: edge.to.nodeId,
    sourceHandle: edge.from.portId,
    targetHandle: edge.to.portId,
    data: {
      mappings: edge.mappings ?? [],
    },
  }))
}

export function useFlowV2Builder(flowId: string, _options?: UseFlowV2BuilderOptions): UseFlowV2BuilderResult | null {
  const builder = useWorkflowBuilder()

  const { setNodes, setEdges, setWorkflowName, setHasUnsavedChanges } = builder

  const [flowState, setFlowState] = useState<FlowV2BuilderState>(() => ({
    flowId,
    flow: null,
    revisionId: undefined,
    version: undefined,
    isLoading: false,
    isSaving: false,
    error: undefined,
    lastAgentPrompt: undefined,
    agentRationale: undefined,
    agentPrerequisites: [],
    pendingAgentEdits: [],
    lastRunId: undefined,
    runs: {},
    nodeSnapshots: {},
    secrets: [],
  }))

  const flowRef = useRef<Flow | null>(null)
  const revisionIdRef = useRef<string | undefined>(undefined)
  const pendingConfigRef = useRef<Map<string, Record<string, any>>>(new Map())
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef<boolean>(false)

  const updateReactFlowGraph = useCallback(
    (flow: Flow) => {
      const nodes = flowToReactFlowNodes(flow)
      const edges = flowToReactFlowEdges(flow)
      setNodes(nodes)
      setEdges(edges)
      setWorkflowName(flow.name ?? "Untitled Flow")
      setHasUnsavedChanges(false)
    },
    [setEdges, setNodes, setWorkflowName, setHasUnsavedChanges]
  )

  const setLoading = useCallback((isLoading: boolean) => {
    setFlowState((prev) => ({
      ...prev,
      isLoading,
    }))
  }, [])

  const setSaving = useCallback((isSaving: boolean) => {
    setFlowState((prev) => ({
      ...prev,
      isSaving,
    }))
  }, [])

  const load = useCallback(async () => {
    if (!flowId) return
    setLoading(true)
    try {
      const revisionsPayload = await fetchJson<{ revisions?: Array<{ id: string; version: number }> }>(
        `/workflows/v2/api/flows/${flowId}/revisions`
      )
      const revisions = (revisionsPayload.revisions ?? []).slice().sort((a, b) => b.version - a.version)
      if (revisions.length === 0) {
        throw new Error("Flow revision not found")
      }

      const revisionId = revisions[0].id

      const revisionPayload = await fetchJson<{ revision: { id: string; flowId: string; graph: Flow } }>(
        `/workflows/v2/api/flows/${flowId}/revisions/${revisionId}`
      )

      const flow = FlowSchema.parse(revisionPayload.revision.graph)
      flowRef.current = flow
      revisionIdRef.current = revisionPayload.revision.id
      updateReactFlowGraph(flow)

      setFlowState((prev) => ({
        ...prev,
        flow,
        revisionId: revisionPayload.revision.id,
        version: flow.version ?? revisions[0].version,
        error: undefined,
      }))
    } catch (error: any) {
      const message = error?.message ?? "Failed to load flow"
      console.error("[useFlowV2Builder] load failed", message)
      setFlowState((prev) => ({
        ...prev,
        error: message,
      }))
    } finally {
      setLoading(false)
    }
  }, [flowId, setLoading, updateReactFlowGraph])

  const ensureFlow = useCallback(async () => {
    if (flowRef.current) {
      return flowRef.current
    }
    await load()
    if (!flowRef.current) {
      throw new Error("Flow not loaded")
    }
    return flowRef.current
  }, [load])

  const applyEdits = useCallback(
    async (edits: PlannerEdit[]) => {
      if (!edits || edits.length === 0) {
        const current = await ensureFlow()
        return current
      }

      const baseFlow = await ensureFlow()
      const nextFlow = applyPlannerEdits(baseFlow, edits)

      setSaving(true)
      try {
        const payload = await fetchJson<{ flow: Flow; revisionId?: string; version?: number }>(
          `/workflows/v2/api/flows/${flowId}/apply-edits`,
          {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
              flow: nextFlow,
              version: nextFlow.version,
            }),
          }
        )

        const updatedFlow = FlowSchema.parse(payload.flow)
        flowRef.current = updatedFlow
        revisionIdRef.current = payload.revisionId ?? revisionIdRef.current
        updateReactFlowGraph(updatedFlow)

        setFlowState((prev) => ({
          ...prev,
          flow: updatedFlow,
          revisionId: payload.revisionId ?? prev.revisionId,
          version: updatedFlow.version ?? payload.version ?? prev.version,
          pendingAgentEdits: [],
        }))

        return updatedFlow
      } finally {
        setSaving(false)
      }
    },
    [ensureFlow, flowId, setSaving, updateReactFlowGraph]
  )

  const askAgent = useCallback(
    async (prompt: string): Promise<AgentResult> => {
      const flow = await ensureFlow()
      const payload = await fetchJson<{
        edits?: PlannerEdit[]
        prerequisites?: string[]
        rationale?: string
        workflowName?: string
      }>(`/workflows/v2/api/flows/${flowId}/edits`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          prompt,
          flow,
        }),
      })

      const result: AgentResult = {
        edits: payload.edits ?? [],
        prerequisites: payload.prerequisites ?? [],
        rationale: payload.rationale,
        workflowName: payload.workflowName,
      }

      setFlowState((prev) => ({
        ...prev,
        lastAgentPrompt: prompt,
        agentRationale: payload.rationale,
        agentPrerequisites: payload.prerequisites ?? [],
        pendingAgentEdits: result.edits,
      }))

      return result
    },
    [ensureFlow, flowId]
  )

  const flushPendingConfig = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    const pendingEntries = Array.from(pendingConfigRef.current.entries())
    if (pendingEntries.length === 0) {
      return
    }

    pendingConfigRef.current = new Map()
    const edits: PlannerEdit[] = pendingEntries.map(([nodeId, patch]) => ({
      op: "setConfig",
      nodeId,
      patch,
    }))

    try {
      await applyEdits(edits)
    } catch (error) {
      console.error("[useFlowV2Builder] Failed to flush config updates", error)
    }
  }, [applyEdits])

  const updateConfig = useCallback(
    (nodeId: string, patch: Record<string, any>) => {
      if (!nodeId || !patch) return
      const existing = pendingConfigRef.current.get(nodeId) ?? {}
      pendingConfigRef.current.set(nodeId, { ...existing, ...patch })

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(() => {
        flushPendingConfig().catch((error) => {
          console.error("[useFlowV2Builder] Debounced config update failed", error)
        })
      }, 600)
    },
    [flushPendingConfig]
  )

  const updateFlowName = useCallback(
    async (name: string) => {
      const baseFlow = await ensureFlow()
      const trimmed = name.trim()
      if (!trimmed || baseFlow.name === trimmed) {
        return
      }

      const nextFlow = cloneFlow(baseFlow)
      nextFlow.name = trimmed
      nextFlow.version = (nextFlow.version ?? 0) + 1

      setSaving(true)
      try {
        const payload = await fetchJson<{ flow: Flow; revisionId?: string; version?: number }>(
          `/workflows/v2/api/flows/${flowId}/apply-edits`,
          {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
              flow: nextFlow,
              version: nextFlow.version,
            }),
          }
        )

        const updatedFlow = FlowSchema.parse(payload.flow)
        flowRef.current = updatedFlow
        revisionIdRef.current = payload.revisionId ?? revisionIdRef.current
        updateReactFlowGraph(updatedFlow)

        setFlowState((prev) => ({
          ...prev,
          flow: updatedFlow,
          revisionId: payload.revisionId ?? prev.revisionId,
          version: updatedFlow.version ?? payload.version ?? prev.version,
        }))
      } finally {
        setSaving(false)
      }
    },
    [ensureFlow, flowId, setSaving, updateReactFlowGraph]
  )

  const addNode = useCallback(
    async (type: string, position?: XYPosition) => {
      const edit = addNodeEdit(type, position)
      await applyEdits([edit as PlannerEdit])
    },
    [applyEdits]
  )

  const connectEdge = useCallback(
    async (params: { sourceId: string; targetId: string; sourceHandle?: string; targetHandle?: string }) => {
      const edit = oldConnectToEdge(params.sourceId, params.targetId, params.sourceHandle, params.targetHandle)
      await applyEdits([edit as PlannerEdit])
    },
    [applyEdits]
  )

  const run = useCallback(
    async (inputs: any) => {
      const payload = await fetchJson<{ runId: string }>(`/workflows/v2/api/flows/${flowId}/runs`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ inputs }),
      })

      setFlowState((prev) => ({
        ...prev,
        lastRunId: payload.runId,
      }))

      return { runId: payload.runId }
    },
    [flowId]
  )

  const runFromHere = useCallback(
    async (nodeId: string, runId?: string) => {
      const targetRun = runId ?? flowState.lastRunId
      if (!targetRun) {
        throw new Error("No run available to resume")
      }

      const payload = await fetchJson<{ runId: string }>(
        `/workflows/v2/api/runs/${targetRun}/nodes/${nodeId}/run-from-here`,
        {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({}),
        }
      )

      setFlowState((prev) => ({
        ...prev,
        lastRunId: payload.runId,
      }))

      return { runId: payload.runId }
    },
    [flowState.lastRunId]
  )

  const refreshRun = useCallback(
    async (runId?: string) => {
      const targetRun = runId ?? flowState.lastRunId
      if (!targetRun) {
        return null
      }

      const payload = await fetchJson<{ run: RunDetails }>(`/workflows/v2/api/runs/${targetRun}`)
      const runDetails = payload.run

      setFlowState((prev) => ({
        ...prev,
        lastRunId: runDetails.id,
        runs: {
          ...prev.runs,
          [runDetails.id]: runDetails,
        },
      }))

      return runDetails
    },
    [flowState.lastRunId]
  )

  const getNodeSnapshot = useCallback(
    async (nodeId: string, runId?: string) => {
      const targetRun = runId ?? flowState.lastRunId
      if (!targetRun) {
        return null
      }

      const payload = await fetchJson<{ snapshot?: any; lineage?: any[] }>(
        `/workflows/v2/api/runs/${targetRun}/nodes/${nodeId}`
      )

      const result: NodeSnapshotResult = {
        snapshot: payload.snapshot,
        lineage: payload.lineage ?? [],
      }

      setFlowState((prev) => ({
        ...prev,
        nodeSnapshots: {
          ...prev.nodeSnapshots,
          [nodeId]: result,
        },
      }))

      return result
    },
    [flowState.lastRunId]
  )

  const listSecrets = useCallback(async () => {
    const payload = await fetchJson<{ ok: boolean; secrets?: Array<{ id: string; name: string }> }>(
      `/workflows/v2/api/secrets`
    )
    if (!payload.ok) {
      throw new Error("Failed to list secrets")
    }
    const secrets = payload.secrets ?? []

    setFlowState((prev) => ({
      ...prev,
      secrets,
    }))

    return secrets
  }, [])

  const createSecret = useCallback(
    async (name: string, value: string, workspaceId?: string) => {
      const payload = await fetchJson<{ ok: boolean; secret: { id: string; name: string } }>(`/workflows/v2/api/secrets`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name, value, workspaceId }),
      })

      if (!payload.ok) {
        throw new Error("Failed to create secret")
      }

      await listSecrets()

      return payload.secret
    },
    [listSecrets]
  )

  const estimate = useCallback(async () => {
    try {
      const payload = await fetchJson<any>(`/workflows/v2/api/flows/${flowId}/estimate`)
      return payload
    } catch (error) {
      console.warn("[useFlowV2Builder] estimate unavailable", error)
      return null
    }
  }, [flowId])

  const publish = useCallback(async () => {
    const payload = await fetchJson<{ revisionId: string }>(`/workflows/v2/api/flows/${flowId}/publish`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({}),
    })

    setFlowState((prev) => ({
      ...prev,
      revisionId: payload.revisionId,
    }))

    return payload
  }, [flowId])

  const actions = useMemo<FlowV2BuilderActions>(
    () => ({
      load,
      applyEdits,
      askAgent,
      updateConfig,
      updateFlowName,
      addNode,
      connectEdge,
      run,
      runFromHere,
      refreshRun,
      getNodeSnapshot,
      listSecrets,
      createSecret,
      estimate,
      publish,
    }),
    [
      addNode,
      applyEdits,
      askAgent,
      connectEdge,
      createSecret,
      estimate,
      getNodeSnapshot,
      updateFlowName,
      listSecrets,
      load,
      publish,
      refreshRun,
      run,
      runFromHere,
      updateConfig,
    ]
  )

  useEffect(() => {
    isMountedRef.current = true
    load().catch((error) => {
      console.error("[useFlowV2Builder] initial load failed", error)
    })
    return () => {
      isMountedRef.current = false
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      flushPendingConfig().catch((error) => {
        console.error("[useFlowV2Builder] flush on unmount failed", error)
      })
    }
  }, [flushPendingConfig, load])

  return {
    ...builder,
    flowState,
    actions,
  }
}
