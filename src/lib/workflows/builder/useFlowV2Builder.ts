"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Edge as ReactFlowEdge, Node as ReactFlowNode, XYPosition } from "@xyflow/react"

import { useWorkflowBuilder } from "@/hooks/workflows/useWorkflowBuilder"
import { FlowSchema, type Flow, type FlowInterface, type Node as FlowNode, type Edge as FlowEdge } from "./schema"
import { addNodeEdit, oldConnectToEdge } from "../compat/v2Adapter"
import { ALL_NODE_COMPONENTS } from "../../../../lib/workflows/nodes"

const LINEAR_STACK_X = 400

export interface UseFlowV2BuilderOptions {
  initialPrompt?: string
  autoOpenAgentPanel?: boolean
  initialRevision?: any // Pre-fetched revision data from server
}

type PlannerEdit =
  | { op: "addNode"; node: FlowNode }
  | { op: "connect"; edge: FlowEdge }
  | { op: "setConfig"; nodeId: string; patch: Record<string, any> }
  | { op: "setInterface"; inputs: FlowInterface["inputs"]; outputs: FlowInterface["outputs"] }
  | { op: "deleteNode"; nodeId: string }
  | { op: "reorderNodes"; nodeIds: string[] }

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
  revisionCount: number
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
  deleteNode: (nodeId: string) => Promise<void>
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

function reorderLinearChain(flow: Flow, orderedNodeIds: string[]) {
  if (!Array.isArray(orderedNodeIds) || orderedNodeIds.length < 2) {
    return
  }

  const nodeSet = new Set(flow.nodes.map((node) => node.id))
  const deduped = Array.from(new Set(orderedNodeIds)).filter((id) => nodeSet.has(id))
  if (deduped.length < 2) {
    return
  }

  const reorderSet = new Set(deduped)
  const preservedEdges: FlowEdge[] = []
  const incomingEdges: FlowEdge[] = []
  const outgoingEdges: FlowEdge[] = []
  const internalEdgeMap = new Map<string, FlowEdge>()

  for (const edge of flow.edges) {
    const fromInSet = reorderSet.has(edge.from.nodeId)
    const toInSet = reorderSet.has(edge.to.nodeId)

    if (fromInSet && toInSet) {
      internalEdgeMap.set(`${edge.from.nodeId}->${edge.to.nodeId}`, edge)
      continue
    }

    if (!fromInSet && toInSet) {
      incomingEdges.push(edge)
      continue
    }

    if (fromInSet && !toInSet) {
      outgoingEdges.push(edge)
      continue
    }

    preservedEdges.push(edge)
  }

  if (incomingEdges.length > 1 || outgoingEdges.length > 1) {
    console.warn("[useFlowV2Builder] Skipping reorder due to branching connections", {
      orderedNodeIds,
      incoming: incomingEdges.length,
      outgoing: outgoingEdges.length,
    })
    return
  }

  const getNodePosition = (nodeId: string): number => {
    const node = flow.nodes.find((n) => n.id === nodeId)
    if (!node) return Number.MAX_SAFE_INTEGER
    const metadata = (node.metadata ?? {}) as any
    const y = metadata.position?.y
    if (typeof y === "number") {
      return y
    }
    return 120 + orderedNodeIds.indexOf(nodeId) * 180
  }

  const originalOrder = deduped.slice().sort((a, b) => getNodePosition(a) - getNodePosition(b))
  const nextEdges: FlowEdge[] = [...preservedEdges]
  const firstNodeId = deduped[0]
  const lastNodeId = deduped[deduped.length - 1]

  const boundaryIncoming = incomingEdges[0]
  if (boundaryIncoming && firstNodeId) {
    nextEdges.push({
      ...boundaryIncoming,
      to: {
        ...boundaryIncoming.to,
        nodeId: firstNodeId,
      },
    })
  }

  const pickTemplateEdge = (): FlowEdge | undefined => {
    const entry = internalEdgeMap.values().next()
    if (!entry.done) {
      return entry.value
    }
    return undefined
  }

  for (let i = 0; i < deduped.length - 1; i++) {
    const sourceId = deduped[i]
    const targetId = deduped[i + 1]
    const template = internalEdgeMap.get(`${sourceId}->${targetId}`) ?? pickTemplateEdge()

    const newEdge: FlowEdge = {
      id: `${sourceId}-${targetId}`,
      from: {
        nodeId: sourceId,
        portId: template?.from.portId ?? "source",
      },
      to: {
        nodeId: targetId,
        portId: template?.to.portId ?? "target",
      },
      mappings: template?.mappings ?? [],
      metadata: template?.metadata,
    }

    nextEdges.push(newEdge)
  }

  const boundaryOutgoing = outgoingEdges[0]
  if (boundaryOutgoing && lastNodeId) {
    nextEdges.push({
      ...boundaryOutgoing,
      from: {
        ...boundaryOutgoing.from,
        nodeId: lastNodeId,
      },
    })
  }

  flow.edges = nextEdges

  const sortedPositions = originalOrder
    .map((nodeId) => getNodePosition(nodeId))
    .sort((a, b) => a - b)

  deduped.forEach((nodeId, index) => {
    const node = flow.nodes.find((n) => n.id === nodeId)
    if (!node) {
      return
    }
    const metadata = { ...(node.metadata ?? {}) }
    const position = { ...(metadata.position ?? {}) }
    position.x = LINEAR_STACK_X
    const fallbackY = 120 + index * 180
    position.y = sortedPositions[index] ?? fallbackY
    metadata.position = position
    node.metadata = metadata
  })
}

function applyPlannerEdits(base: Flow, edits: PlannerEdit[]): Flow {
  const working = cloneFlow(base)

  for (const edit of edits) {
    switch (edit.op) {
      case "addNode": {
        const exists = working.nodes.find((node) => node.id === edit.node.id)
        if (!exists) {
          // Simply append the node to the end
          // React Flow handles visual positioning based on metadata.position
          // Don't try to sort or reposition existing nodes as it causes visual jumps
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
      case "deleteNode": {
        // Find edges connected to this node before deletion
        const incomingEdge = working.edges.find((edge) => edge.to.nodeId === edit.nodeId)
        const outgoingEdge = working.edges.find((edge) => edge.from.nodeId === edit.nodeId)

        // Remove the node
        working.nodes = working.nodes.filter((node) => node.id !== edit.nodeId)

        // Remove any edges connected to this node
        working.edges = working.edges.filter(
          (edge) => edge.from.nodeId !== edit.nodeId && edge.to.nodeId !== edit.nodeId
        )

        // If the deleted node was in the middle of a chain, reconnect the edges
        if (incomingEdge && outgoingEdge) {
          working.edges.push({
            id: `${incomingEdge.from.nodeId}-${outgoingEdge.to.nodeId}`,
            from: incomingEdge.from,
            to: outgoingEdge.to,
            mappings: [],
          })
        }
        break
      }
      case "reorderNodes": {
        reorderLinearChain(working, edit.nodeIds)
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

const NODE_COMPONENT_MAP = new Map(ALL_NODE_COMPONENTS.map((node) => [node.type, node]))

function flowToReactFlowNodes(flow: Flow, onDelete?: (nodeId: string) => void): ReactFlowNode[] {
  return flow.nodes.map((node, index) => {
    const metadata = (node.metadata ?? {}) as any
    const defaultY = 120 + index * 180
    const rawPosition = metadata.position ?? { x: LINEAR_STACK_X, y: defaultY }
    const positionY = rawPosition.y ?? defaultY
    const position = {
      x: LINEAR_STACK_X,
      y: positionY,
    }

    console.log(`📍 [flowToReactFlowNodes] Node ${node.id}:`, {
      index,
      savedPosition: metadata.position,
      defaultY,
      finalY: positionY
    })

    const catalogNode = NODE_COMPONENT_MAP.get(node.type)
    const providerId = metadata.providerId ?? catalogNode?.providerId
    const icon = catalogNode?.icon
    const description = node.description ?? catalogNode?.description

    return {
      id: node.id,
      type: metadata.reactFlowType ?? "custom",
      position,
      positionAbsolute: position,
      data: {
        label: node.label ?? node.type,
        title: node.label ?? node.type,
        type: node.type,
        config: node.config ?? {},
        description,
        providerId,
        icon,
        isTrigger: metadata.isTrigger ?? false,
        agentHighlights: metadata.agentHighlights ?? [],
        costHint: node.costHint ?? 0,
        onDelete,
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

const ALIGNMENT_LOG_PREFIX = "[WorkflowAlign]"

function debugLog(label: string, payload?: any) {
  if (typeof window === "undefined") return
  if (payload === undefined) {
    console.log(`${ALIGNMENT_LOG_PREFIX} ${label}`)
    return
  }
  console.log(`${ALIGNMENT_LOG_PREFIX} ${label}: ${JSON.stringify(payload, null, 2)}`)
}

function debugLogNodes(label: string, nodes: ReactFlowNode[]) {
  if (typeof window === "undefined") return
  const payload = nodes.map(node => ({
    id: node.id,
    type: (node.data as any)?.type,
    position: node.position,
  }))
  debugLog(label, payload)
}

function shouldAlignToLinearColumn(node: ReactFlowNode): boolean {
  const dataType = (node.data as any)?.type
  if (typeof node.id === "string" && node.id.startsWith("temp-")) return false
  if (node.type === "addAction" || node.type === "insertAction" || node.type === "chainPlaceholder") {
    return false
  }
  if (dataType === "chain_placeholder") return false
  return true
}

export function useFlowV2Builder(flowId: string, options?: UseFlowV2BuilderOptions): UseFlowV2BuilderResult | null {
  const builder = useWorkflowBuilder()

  const { setNodes, setEdges, setWorkflowName, setHasUnsavedChanges, getNodes } = builder

  // Track if we've used the initial revision
  const initialRevisionUsedRef = useRef(false)

  const [flowState, setFlowState] = useState<FlowV2BuilderState>(() => ({
    flowId,
    flow: null,
    revisionId: undefined,
    version: undefined,
    revisionCount: 0,
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
  const deleteNodeRef = useRef<((nodeId: string) => Promise<void>) | null>(null)

  const syncLatestRunId = useCallback(async () => {
    if (!flowId) return

    try {
      const payload = await fetchJson<{ run: { id: string } | null }>(
        `/workflows/v2/api/flows/${flowId}/runs/latest`
      )

      if (payload?.run?.id) {
        setFlowState((prev) => ({
          ...prev,
          lastRunId: payload.run!.id,
        }))
      }
    } catch (error) {
      console.debug("[useFlowV2Builder] Unable to fetch latest run", error)
    }
  }, [flowId])

  const updateReactFlowGraph = useCallback(
    (flow: Flow) => {
      const existingNodes = getNodes ? getNodes() : []
      const existingNodeMap = new Map<string, ReactFlowNode>(
        existingNodes
          .filter(node => !node.id.startsWith("temp-"))
          .map(node => [node.id, node])
      )

      const placeholderQueue = existingNodes
        .filter(node => node.id.startsWith("temp-"))
        .map(node => ({
          type: (node.data as any)?.type,
          position: node.position,
          consumed: false,
        }))

      let graphNodes = flowToReactFlowNodes(flow, deleteNodeRef.current ?? undefined).map(node => {
        const existing = existingNodeMap.get(node.id)
        if (existing) {
          const alignedPosition = {
            x: LINEAR_STACK_X,
            y: existing.position?.y ?? node.position.y,
          }
          return {
            ...node,
            position: alignedPosition,
            positionAbsolute: alignedPosition,
            // Preserve existing node state and className to prevent resetting from 'passed' to 'ready'
            data: {
              ...node.data,
              ...(existing.data?.state ? { state: existing.data.state } : {}),
            },
            ...(existing.className ? { className: existing.className } : {}),
          }
        }

        // Only try to match placeholders if the intended position is close to a placeholder position
        // This ensures we only consume placeholders that are actually at the insertion point
        const placeholder = placeholderQueue.find(
          entry => {
            if (entry.consumed) return false
            if (entry.type !== (node.data as any)?.type) return false

            // Only match if the node's position is within 50px of the placeholder position
            // This ensures we only consume placeholders that are actually at the insertion point
            const yDiff = Math.abs(entry.position.y - node.position.y)
            return yDiff < 50
          }
        )

        if (placeholder) {
          placeholder.consumed = true
          debugLog("Placeholder consumed", {
            nodeId: node.id,
            matchedType: (node.data as any)?.type,
            placeholderPosition: placeholder.position,
          })
          return {
            ...node,
            position: {
              x: LINEAR_STACK_X,
              y: placeholder.position?.y ?? node.position.y,
            },
            positionAbsolute: {
              x: LINEAR_STACK_X,
              y: placeholder.position?.y ?? node.position.y,
            },
          }
        }

        return node
      })

      if (typeof window !== "undefined") {
        console.clear()
      }
      debugLog("updateReactFlowGraph", {
        nodesReceived: flow.nodes.length,
        placeholdersReused: placeholderQueue.filter(entry => entry.consumed).length,
      })
      debugLogNodes("Before alignment", graphNodes)

      // Normalize horizontal alignment so nodes stay in a single vertical stack.
      graphNodes = graphNodes.map(node => {
        if (!shouldAlignToLinearColumn(node)) {
          return node
        }

        return {
          ...node,
          position: {
            ...node.position,
            x: LINEAR_STACK_X,
          },
        }
      })
      debugLogNodes("After alignment", graphNodes)
      debugLog("Alignment snapshot", {
        linearX: LINEAR_STACK_X,
        nodePositions: graphNodes.map(node => ({
          id: node.id,
          type: (node.data as any)?.type,
          x: node.position.x,
          y: node.position.y,
        })),
      })
      const placeholderId = graphNodes.find(node => (node.data as any)?.isTrigger)?.id
      debugLog("Flow alignment debug", {
        placeholderId,
        targetX: LINEAR_STACK_X,
        nodes: graphNodes.map(node => ({
          id: node.id,
          type: (node.data as any)?.type,
          x: node.position.x,
          y: node.position.y,
        })),
      })

      let edges = flowToReactFlowEdges(flow)

      // Zapier-style placeholder nodes: If workflow is empty, add trigger + action placeholders
      // If workflow has only a trigger, add just the action placeholder
      // Note: onConfigure handler will be added by WorkflowBuilderV2 when it enriches nodes
      console.log('🔍 [updateReactFlowGraph] flow.nodes.length:', flow.nodes.length)
      if (flow.nodes.length > 0) {
        console.log('🔍 [updateReactFlowGraph] First node:', {
          id: flow.nodes[0].id,
          type: flow.nodes[0].type,
          metadata: flow.nodes[0].metadata,
          isTrigger: flow.nodes[0].metadata?.isTrigger
        })
      }

      if (flow.nodes.length === 0) {
        // Calculate center position based on viewport
        // Account for agent panel if it's open (default is open on first load)
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080

        // Assume agent panel is 420px (will be adjusted by fitView later)
        const agentPanelWidth = 420
        const availableWidth = viewportWidth - agentPanelWidth

        // Center in the available space
        const centerX = agentPanelWidth + (availableWidth / 2) - 180 // 180 = half of node width (360px)
        const centerY = (viewportHeight / 2) - 150 // Start a bit above center for vertical spacing

        graphNodes = [
          {
            id: 'trigger-placeholder',
            type: 'trigger_placeholder',
            position: { x: centerX, y: centerY },
            data: {
              type: 'trigger_placeholder',
              isPlaceholder: true,
              title: 'Trigger',
              // onConfigure will be added by FlowV2BuilderContent via enrichedNodes
            },
          },
          {
            id: 'action-placeholder',
            type: 'action_placeholder',
            position: { x: centerX, y: centerY + 180 }, // 180px vertical spacing + plus button
            data: {
              type: 'action_placeholder',
              isPlaceholder: true,
              title: 'Action',
              // onConfigure will be added by FlowV2BuilderContent via enrichedNodes
            },
          },
        ] as ReactFlowNode[]

        edges = [
          {
            id: 'placeholder-edge',
            source: 'trigger-placeholder',
            target: 'action-placeholder',
            type: 'custom', // Use custom type to get FlowEdge with plus button
            style: {
              stroke: '#d0d6e0', // Match FlowEdge default color
            },
          },
        ] as ReactFlowEdge[]
      } else if (flow.nodes.length === 1 && flow.nodes[0].metadata?.isTrigger) {
        // If we have only a trigger node, add an action placeholder after it
        const triggerNode = graphNodes[0]
        if (triggerNode) {
          const actionPlaceholder: ReactFlowNode = {
            id: 'action-placeholder',
            type: 'action_placeholder',
            position: {
              x: triggerNode.position.x,
              y: triggerNode.position.y + 180 // 180px vertical spacing
            },
            data: {
              type: 'action_placeholder',
              isPlaceholder: true,
              title: 'Action',
              // onConfigure will be added by FlowV2BuilderContent via enrichedNodes
            },
          }

          graphNodes.push(actionPlaceholder)

          // Add edge from trigger to action placeholder
          edges.push({
            id: `${triggerNode.id}-action-placeholder`,
            source: triggerNode.id,
            target: 'action-placeholder',
            sourceHandle: 'source',
            targetHandle: 'target',
            type: 'custom',
            style: {
              stroke: '#d0d6e0',
            },
      } as ReactFlowEdge)
        }
      }

      if (edges.length === 0 && graphNodes.length >= 2) {
        const sortedLinearNodes = [...graphNodes]
          .filter((node) => node.type !== 'action_placeholder' && node.type !== 'trigger_placeholder')
          .sort((a, b) => a.position.y - b.position.y)

        for (let i = 0; i < sortedLinearNodes.length - 1; i++) {
          const current = sortedLinearNodes[i]
          const next = sortedLinearNodes[i + 1]

          edges.push({
            id: `${current.id}-${next.id}-synthetic`,
            source: current.id,
            target: next.id,
            sourceHandle: 'source',
            targetHandle: 'target',
            type: 'custom',
            style: {
              stroke: '#d0d6e0',
            },
            data: {
              synthetic: true,
            },
          } as ReactFlowEdge)
        }
      }

      setNodes(graphNodes)
      setEdges(edges)
      setWorkflowName(flow.name ?? "Untitled Flow")
      setHasUnsavedChanges(false)
    },
    [getNodes, setEdges, setNodes, setWorkflowName, setHasUnsavedChanges]
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

    // If we have initialRevision and haven't used it yet, use it instead of fetching
    if (options?.initialRevision && !initialRevisionUsedRef.current) {
      initialRevisionUsedRef.current = true
      setLoading(true)
      try {
        const flow = FlowSchema.parse(options.initialRevision.graph)
        flowRef.current = flow
        revisionIdRef.current = options.initialRevision.id
        updateReactFlowGraph(flow)

        setFlowState((prev) => ({
          ...prev,
          flow,
          revisionId: options.initialRevision.id,
          version: flow.version,
          revisionCount: 1, // We don't have revision count from server, set to 1
          error: undefined,
        }))
        void syncLatestRunId()
      } catch (error: any) {
        setFlowState((prev) => ({
          ...prev,
          error: error.message ?? String(error),
        }))
      } finally {
        setLoading(false)
      }
      return
    }

    // Otherwise, fetch from API as usual
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
        revisionCount: revisions.length,
        error: undefined,
      }))
      void syncLatestRunId()
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
  }, [flowId, setLoading, syncLatestRunId, updateReactFlowGraph])

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

  // Queue to ensure only one applyEdits runs at a time (prevents race conditions)
  const applyEditsQueue = useRef<Promise<Flow | undefined>>(Promise.resolve(undefined))

  const applyEdits = useCallback(
    async (edits: PlannerEdit[]) => {
      // Queue this request to run after the previous one completes
      const previousRequest = applyEditsQueue.current

      const thisRequest = previousRequest.then(async () => {
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
            revisionCount: (prev.revisionCount ?? 0) + 1,
            pendingAgentEdits: [],
          }))

          return updatedFlow
        } finally {
          setSaving(false)
        }
      })

      // Update the queue with this request
      applyEditsQueue.current = thisRequest

      // Return this specific request (not the queue)
      return thisRequest
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
      console.log('[useFlowV2Builder] updateFlowName called with:', name)
      const baseFlow = await ensureFlow()
      const trimmed = name.trim()
      console.log('[useFlowV2Builder] Current flow name:', baseFlow.name, '| New trimmed name:', trimmed)

      if (!trimmed || baseFlow.name === trimmed) {
        console.log('[useFlowV2Builder] ⚠️ Skipping update - name is empty or unchanged')
        return
      }

      const nextFlow = cloneFlow(baseFlow)
      nextFlow.name = trimmed
      nextFlow.version = (nextFlow.version ?? 0) + 1
      console.log('[useFlowV2Builder] Preparing to update flow name to:', trimmed, '| New version:', nextFlow.version)

      setSaving(true)
      try {
        console.log('[useFlowV2Builder] Calling /apply-edits API...')
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
        console.log('[useFlowV2Builder] ✅ API call succeeded, received flow with name:', payload.flow.name)

        const updatedFlow = FlowSchema.parse(payload.flow)
        flowRef.current = updatedFlow
        revisionIdRef.current = payload.revisionId ?? revisionIdRef.current
        updateReactFlowGraph(updatedFlow)
        console.log('[useFlowV2Builder] ✅ Updated refs and graph')

        setFlowState((prev) => ({
          ...prev,
          flow: updatedFlow,
          revisionId: payload.revisionId ?? prev.revisionId,
          version: updatedFlow.version ?? payload.version ?? prev.version,
          revisionCount: (prev.revisionCount ?? 0) + 1,
        }))
        console.log('[useFlowV2Builder] ✅ Updated flowState with new name:', updatedFlow.name)
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

  const deleteNode = useCallback(
    async (nodeId: string) => {
      const edit: PlannerEdit = { op: "deleteNode", nodeId }
      await applyEdits([edit])
    },
    [applyEdits]
  )

  // Store deleteNode in ref for use in updateReactFlowGraph
  useEffect(() => {
    deleteNodeRef.current = deleteNode
  }, [deleteNode])

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
      deleteNode,
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
      deleteNode,
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
