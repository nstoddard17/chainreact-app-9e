"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Edge as ReactFlowEdge, Node as ReactFlowNode, XYPosition } from "@xyflow/react"

import { useWorkflowBuilder } from "@/hooks/workflows/useWorkflowBuilder"
import { FlowSchema, type Flow, type FlowInterface, type Node as FlowNode, type Edge as FlowEdge } from "./schema"
import { addNodeEdit, oldConnectToEdge, generateId } from "../compat/v2Adapter"
import { ALL_NODE_COMPONENTS } from "../../../../lib/workflows/nodes"
import { flowApiUrl } from "./api/paths"

const LINEAR_STACK_X = 400
const DEFAULT_VERTICAL_SPACING = 180

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
  | { op: "moveNode"; nodeId: string; position: { x: number; y: number } }
  | { op: "updateNode"; nodeId: string; updates: { title?: string; description?: string } }

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

export interface ApplyEditsOptions {
  /** Skip updating React Flow graph after API response (for optimistic updates) */
  skipGraphUpdate?: boolean
}

export interface FlowV2BuilderActions {
  load: () => Promise<void>
  loadRevision: (revisionId: string) => Promise<Flow>
  applyEdits: (edits: PlannerEdit[], options?: ApplyEditsOptions) => Promise<Flow>
  askAgent: (prompt: string) => Promise<AgentResult>
  updateConfig: (nodeId: string, patch: Record<string, any>) => void
  updateFlowName: (name: string) => Promise<void>
  addNode: (type: string, position?: XYPosition, nodeId?: string) => Promise<string>
  deleteNode: (nodeId: string) => Promise<void>
  moveNodes: (moves: Array<{ nodeId: string; position: { x: number; y: number } }>) => Promise<void>
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

// Default timeout for API calls - 15 seconds for most operations
const DEFAULT_TIMEOUT_MS = 15000

async function fetchJson<T>(input: RequestInfo, init?: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(input, {
      credentials: "include",
      ...init,
      headers: {
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      throw new Error(text || `Request failed (${response.status})`)
    }

    return (await response.json()) as T
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
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

  const currentPositions = deduped.map((nodeId) => getNodePosition(nodeId))
  const baseY = currentPositions.length > 0 ? Math.min(...currentPositions) : 0

  // Get the X position from the first node to preserve horizontal alignment
  const firstNode = flow.nodes.find((n) => n.id === deduped[0])
  const baseX = (firstNode?.metadata as any)?.position?.x ?? LINEAR_STACK_X

  deduped.forEach((nodeId, index) => {
    const node = flow.nodes.find((n) => n.id === nodeId)
    if (!node) {
      return
    }
    const metadata = { ...(node.metadata ?? {}) }
    const position = {
      ...(metadata.position ?? {}),
      x: baseX,
      y: baseY + index * DEFAULT_VERTICAL_SPACING,
    }
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

        // Check if we're deleting a placeholder node (don't recompact positions for placeholders)
        const isPlaceholderDelete = edit.nodeId.includes('placeholder')

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

        // Only recompact positions when deleting real nodes, not placeholders
        // Placeholders are removed during paste operations where new nodes already have correct positions
        if (!isPlaceholderDelete) {
          // Recompact node positions to fill gaps
          // Sort nodes by their current Y position to maintain order
          const nodesWithPositions = working.nodes.map((node) => {
            const metadata = (node.metadata ?? {}) as any
            const currentX = metadata.position?.x ?? LINEAR_STACK_X
            const currentY = metadata.position?.y ?? 0
            return { node, currentX, currentY }
          })
          nodesWithPositions.sort((a, b) => a.currentY - b.currentY)

          // Get the X position from the first node (all nodes should share the same X in a vertical stack)
          const baseX = nodesWithPositions[0]?.currentX ?? LINEAR_STACK_X
          const baseY = 120
          nodesWithPositions.forEach(({ node }, index) => {
            const metadata = { ...(node.metadata ?? {}) } as any
            metadata.position = {
              x: baseX,
              y: baseY + index * DEFAULT_VERTICAL_SPACING,
            }
            node.metadata = metadata
          })
        }

        break
      }
      case "reorderNodes": {
        reorderLinearChain(working, edit.nodeIds)
        break
      }
      case "moveNode": {
        const target = working.nodes.find((node) => node.id === edit.nodeId)
        if (target) {
          const metadata = { ...(target.metadata ?? {}) } as any
          metadata.position = edit.position
          target.metadata = metadata
        }
        break
      }
      case "updateNode": {
        const target = working.nodes.find((node) => node.id === edit.nodeId)
        if (target) {
          // Update label (title) - this is what flowToReactFlowNodes uses for the title
          if (edit.updates.title !== undefined) {
            target.label = edit.updates.title
          }
          // Update description if provided
          if (edit.updates.description !== undefined) {
            target.description = edit.updates.description
          }
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

const NODE_COMPONENT_MAP = new Map(ALL_NODE_COMPONENTS.map((node) => [node.type, node]))

function flowToReactFlowNodes(flow: Flow, onDelete?: (nodeId: string) => void): ReactFlowNode[] {
  // First, determine which nodes are triggers
  const nodeWithTriggerInfo = flow.nodes.map((node) => {
    const metadata = (node.metadata ?? {}) as any
    const catalogNode = NODE_COMPONENT_MAP.get(node.type)
    const isTrigger = metadata.isTrigger ?? catalogNode?.isTrigger ?? false
    return { node, isTrigger, metadata, catalogNode }
  })

  // Sort nodes: triggers first, then actions
  // This ensures correct fallback positioning when metadata.position is missing
  const sortedNodes = [...nodeWithTriggerInfo].sort((a, b) => {
    // If both have positions, sort by Y position
    const aHasPosition = a.metadata.position?.y !== undefined
    const bHasPosition = b.metadata.position?.y !== undefined

    if (aHasPosition && bHasPosition) {
      return (a.metadata.position.y as number) - (b.metadata.position.y as number)
    }

    // If only one has position, prioritize the one with position
    if (aHasPosition && !bHasPosition) return -1
    if (!aHasPosition && bHasPosition) return 1

    // If neither has position, sort triggers first
    if (a.isTrigger && !b.isTrigger) return -1
    if (!a.isTrigger && b.isTrigger) return 1

    // Keep original order for same type
    return 0
  })

  return sortedNodes.map(({ node, isTrigger, metadata, catalogNode }, index) => {
    const defaultY = 120 + index * 180
    const rawPosition = metadata.position ?? { x: LINEAR_STACK_X, y: defaultY }
    // Use saved X position if available, otherwise default to LINEAR_STACK_X
    const positionX = rawPosition.x ?? LINEAR_STACK_X
    const positionY = rawPosition.y ?? defaultY
    const position = {
      x: positionX,
      y: positionY,
    }

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
        isTrigger,
        agentHighlights: metadata.agentHighlights ?? [],
        costHint: node.costHint ?? 0,
        onDelete,
      },
    } as ReactFlowNode
  })
}

function flowToReactFlowEdges(flow: Flow): ReactFlowEdge[] {
  // Deduplicate edges by source->target to prevent overlapping edges on reload
  // Keep the first edge encountered for each unique connection
  const seenEdges = new Set<string>()
  const deduplicatedEdges: ReactFlowEdge[] = []

  for (const edge of flow.edges) {
    const key = `${edge.from.nodeId}->${edge.to.nodeId}`
    if (seenEdges.has(key)) {
      console.warn(`[flowToReactFlowEdges] Skipping duplicate edge: ${key} (id: ${edge.id})`)
      continue
    }
    seenEdges.add(key)

    deduplicatedEdges.push({
      id: edge.id,
      source: edge.from.nodeId,
      target: edge.to.nodeId,
      sourceHandle: edge.from.portId,
      targetHandle: edge.to.portId,
      type: "custom",
      style: {
        stroke: "#d0d6e0",
        strokeWidth: 1.5,
      },
      data: {
        mappings: edge.mappings ?? [],
      },
    })
  }

  return deduplicatedEdges
}

/**
 * Detects missing edges in a linear workflow and returns PlannerEdit operations to create them.
 * This repairs workflows that have nodes but missing connections between them.
 */
function detectMissingEdges(flow: Flow): Array<{ op: "connect"; edge: FlowEdge }> {
  if (!flow.nodes || flow.nodes.length < 2) {
    return []
  }

  // Sort nodes: triggers first, then by position
  const nodesWithInfo = flow.nodes.map((node) => {
    const metadata = (node.metadata ?? {}) as any
    const catalogNode = NODE_COMPONENT_MAP.get(node.type)
    const isTrigger = metadata.isTrigger ?? catalogNode?.isTrigger ?? false
    const posY = metadata.position?.y ?? 0
    return { node, isTrigger, posY }
  })

  const sortedNodes = [...nodesWithInfo].sort((a, b) => {
    // Triggers first
    if (a.isTrigger && !b.isTrigger) return -1
    if (!a.isTrigger && b.isTrigger) return 1
    // Then by Y position
    return a.posY - b.posY
  })

  // Build set of existing edges
  const existingEdges = new Set(
    (flow.edges ?? []).map((e) => `${e.from.nodeId}->${e.to.nodeId}`)
  )

  // Find missing edges between consecutive nodes
  const missingEdges: Array<{ op: "connect"; edge: FlowEdge }> = []

  for (let i = 0; i < sortedNodes.length - 1; i++) {
    const current = sortedNodes[i].node
    const next = sortedNodes[i + 1].node
    const key = `${current.id}->${next.id}`

    if (!existingEdges.has(key)) {
      console.log(`[detectMissingEdges] Found missing edge: ${current.id} -> ${next.id}`)
      missingEdges.push({
        op: "connect",
        edge: {
          id: `${current.id}-${next.id}-repaired`,
          from: { nodeId: current.id, portId: "source" },
          to: { nodeId: next.id, portId: "target" },
          mappings: [],
        },
      })
    }
  }

  return missingEdges
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

  // Track if the workflow has ever had a non-placeholder action node IN THIS SESSION
  // Once true, the action placeholder should never reappear for this session
  // But if they leave and come back, the placeholder will show again if only trigger exists
  const hasHadActionNodeRef = useRef<boolean>(false)

  // Helper to mark that the workflow has had an action node this session
  const markHasHadActionNode = useCallback(() => {
    if (!hasHadActionNodeRef.current) {
      hasHadActionNodeRef.current = true
    }
  }, [])

  const syncLatestRunId = useCallback(async () => {
    if (!flowId) return

    try {
      // Use direct fetch instead of fetchJson to handle 404 gracefully
      // (404 is expected for workflows that haven't been run yet)
      const response = await fetch(`${flowApiUrl(flowId, '/runs/latest')}`, {
        credentials: "include",
      })

      // 404 is expected for new workflows with no runs - silently return
      if (response.status === 404) {
        return
      }

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }

      const payload = await response.json() as { run: { id: string } | null }

      if (payload?.run?.id) {
        setFlowState((prev) => ({
          ...prev,
          lastRunId: payload.run!.id,
        }))
      }
    } catch (error) {
      // Only log non-404 errors (404 is handled above)
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
          // Preserve the existing position (which may be from placeholder or saved)
          const alignedPosition = {
            x: existing.position?.x ?? node.position.x,
            y: existing.position?.y ?? node.position.y,
          }
          return {
            ...node,
            position: alignedPosition,
            positionAbsolute: alignedPosition,
            // Preserve existing node state, className, validationState, needsSetup, and config to prevent resetting
            data: {
              ...node.data,
              ...(existing.data?.state ? { state: existing.data.state } : {}),
              ...(existing.data?.validationState ? { validationState: existing.data.validationState } : {}),
              ...(existing.data?.needsSetup !== undefined ? { needsSetup: existing.data.needsSetup } : {}),
              ...(existing.data?.config ? { config: existing.data.config } : {}),
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
              x: placeholder.position?.x ?? node.position.x,
              y: placeholder.position?.y ?? node.position.y,
            },
            positionAbsolute: {
              x: placeholder.position?.x ?? node.position.x,
              y: placeholder.position?.y ?? node.position.y,
            },
          }
        }

        return node
      })

      // NOTE: Removed console.clear() to preserve paste handler debug logs
      debugLog("updateReactFlowGraph", {
        nodesReceived: flow.nodes.length,
        placeholdersReused: placeholderQueue.filter(entry => entry.consumed).length,
      })
      debugLogNodes("Before alignment", graphNodes)

      // Note: We no longer force X alignment to LINEAR_STACK_X here
      // Nodes now preserve their saved X position (which comes from placeholder positions)
      // This allows the dynamic centering based on viewport to work correctly
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

      // If workflow has 2+ nodes (trigger + at least one action), mark that it has had action nodes
      // This prevents the action placeholder from reappearing if all action nodes are deleted
      if (flow.nodes.length >= 2) {
        markHasHadActionNode()
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
      } else if (flow.nodes.length === 1 && !hasHadActionNodeRef.current) {
        // Check if the single node is a trigger - check both metadata and node definition
        const singleNode = flow.nodes[0]
        const nodeDefinition = ALL_NODE_COMPONENTS.find(c => c.type === singleNode.type)
        const isTriggerNode = singleNode.metadata?.isTrigger || nodeDefinition?.isTrigger || false

        // If we have only a trigger node AND the workflow has never had an action node,
        // add an action placeholder after it. Once a real action node has been added
        // and then deleted, we don't show the placeholder again.
        const triggerNode = graphNodes[0]
        if (isTriggerNode && triggerNode) {
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
      } else if (flow.nodes.length > 0) {
        // Check if there are action nodes but no trigger node
        // This happens when a trigger is deleted but actions remain
        const hasTrigger = flow.nodes.some((node) => {
          const nodeDef = ALL_NODE_COMPONENTS.find(c => c.type === node.type)
          return node.metadata?.isTrigger || nodeDef?.isTrigger || false
        })

        if (!hasTrigger) {
          // Find the topmost node (smallest Y position) to place trigger placeholder above it
          const sortedNodes = [...graphNodes].sort((a, b) => a.position.y - b.position.y)
          const topNode = sortedNodes[0]

          if (topNode) {
            const triggerPlaceholder: ReactFlowNode = {
              id: 'trigger-placeholder',
              type: 'trigger_placeholder',
              position: {
                x: topNode.position.x,
                y: topNode.position.y - 180 // Place 180px above the first node
              },
              data: {
                type: 'trigger_placeholder',
                isPlaceholder: true,
                title: 'Trigger',
              },
            }

            // Add trigger placeholder at the beginning
            graphNodes = [triggerPlaceholder, ...graphNodes]

            // Add edge from trigger placeholder to the first action node
            edges.push({
              id: `trigger-placeholder-${topNode.id}`,
              source: 'trigger-placeholder',
              target: topNode.id,
              sourceHandle: 'source',
              targetHandle: 'target',
              type: 'custom',
              style: {
                stroke: '#d0d6e0',
              },
            } as ReactFlowEdge)
          }
        }
      }

      const sortedLinearNodes = [...graphNodes]
        .filter((node) => node.type !== 'action_placeholder' && node.type !== 'trigger_placeholder')
        .sort((a, b) => {
          // Primary sort: by Y position
          const yDiff = a.position.y - b.position.y
          if (Math.abs(yDiff) > 10) return yDiff // Use 10px tolerance for "same row"

          // Secondary sort: triggers before actions (for nodes at same Y)
          const aIsTrigger = a.data?.isTrigger ?? false
          const bIsTrigger = b.data?.isTrigger ?? false
          if (aIsTrigger && !bIsTrigger) return -1
          if (!aIsTrigger && bIsTrigger) return 1

          return 0
        })

      if (sortedLinearNodes.length >= 2) {
        const edgeKey = (edge: ReactFlowEdge) => `${edge.source}->${edge.target}`
        const existingEdges = new Set(edges.map(edgeKey))

        for (let i = 0; i < sortedLinearNodes.length - 1; i++) {
          const current = sortedLinearNodes[i]
          const next = sortedLinearNodes[i + 1]
          const key = `${current.id}->${next.id}`
          if (existingEdges.has(key)) {
            continue
          }

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
          existingEdges.add(key)
        }
      }

      setNodes(graphNodes)
      setEdges(edges)
      setWorkflowName(flow.name ?? "Untitled Flow")
      setHasUnsavedChanges(false)
    },
    [getNodes, setEdges, setNodes, setWorkflowName, setHasUnsavedChanges, markHasHadActionNode]
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

    // Helper to repair missing edges in a flow
    const repairFlowEdges = (flow: Flow): { repairedFlow: Flow; hadRepairs: boolean } => {
      const missingEdgeEdits = detectMissingEdges(flow)
      if (missingEdgeEdits.length === 0) {
        return { repairedFlow: flow, hadRepairs: false }
      }

      console.log(`[useFlowV2Builder] Repairing ${missingEdgeEdits.length} missing edges`)
      const repairedFlow = {
        ...flow,
        edges: [
          ...flow.edges,
          ...missingEdgeEdits.map((edit) => edit.edge),
        ],
        version: (flow.version ?? 0) + 1,
      }
      return { repairedFlow, hadRepairs: true }
    }

    // Helper to persist repaired flow to database
    const persistRepairedFlow = async (repairedFlow: Flow) => {
      try {
        const payload = await fetchJson<{ flow: Flow; revisionId?: string; version?: number }>(
          `${flowApiUrl(flowId, '/apply-edits')}`,
          {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
              flow: repairedFlow,
              version: repairedFlow.version,
            }),
          }
        )
        console.log('[useFlowV2Builder] Successfully persisted repaired flow with edges')
        return payload
      } catch (error) {
        console.error('[useFlowV2Builder] Failed to persist repaired flow:', error)
        return null
      }
    }

    // If we have initialRevision and haven't used it yet, use it instead of fetching
    if (options?.initialRevision && !initialRevisionUsedRef.current) {
      initialRevisionUsedRef.current = true
      setLoading(true)
      try {
        let flow = FlowSchema.parse(options.initialRevision.graph)

        // Detect and repair missing edges
        const { repairedFlow, hadRepairs } = repairFlowEdges(flow)
        if (hadRepairs) {
          flow = repairedFlow
          // Persist the repairs in the background (don't block the UI)
          void persistRepairedFlow(flow)
        }

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
        `${flowApiUrl(flowId, '/revisions')}`
      )
      const revisions = (revisionsPayload.revisions ?? []).slice().sort((a, b) => b.version - a.version)
      if (revisions.length === 0) {
        throw new Error("Flow revision not found")
      }

      const revisionId = revisions[0].id

      const revisionPayload = await fetchJson<{ revision: { id: string; flowId: string; graph: Flow } }>(
        `${flowApiUrl(flowId, `/revisions/${revisionId}`)}`
      )

      let flow = FlowSchema.parse(revisionPayload.revision.graph)

      // Detect and repair missing edges
      const { repairedFlow, hadRepairs } = repairFlowEdges(flow)
      if (hadRepairs) {
        flow = repairedFlow
        // Persist the repairs in the background (don't block the UI)
        void persistRepairedFlow(flow)
      }

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

  const setFlowFromRevision = useCallback(
    (flow: Flow, revisionId?: string, version?: number, options?: { skipGraphUpdate?: boolean }) => {
      flowRef.current = flow
      if (revisionId) {
        revisionIdRef.current = revisionId
      }

      if (!options?.skipGraphUpdate) {
        updateReactFlowGraph(flow)
      }

      setWorkflowName(flow.name ?? "Untitled Flow")
      setHasUnsavedChanges(false)

      setFlowState((prev) => ({
        ...prev,
        flow,
        revisionId: revisionId ?? prev.revisionId,
        version: flow.version ?? version ?? prev.version,
        error: undefined,
      }))
    },
    [setHasUnsavedChanges, setWorkflowName, updateReactFlowGraph]
  )

  const applyEdits = useCallback(
    async (edits: PlannerEdit[], options?: ApplyEditsOptions) => {
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
            `${flowApiUrl(flowId, '/apply-edits')}`,
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
          // Skip graph update for optimistic updates (e.g., node deletion)
          // The UI was already updated optimistically, so we don't want to overwrite it
          setFlowFromRevision(updatedFlow, payload.revisionId ?? revisionIdRef.current, payload.version, {
            skipGraphUpdate: options?.skipGraphUpdate,
          })
          setFlowState((prev) => ({
            ...prev,
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
    [ensureFlow, flowId, setFlowFromRevision, setSaving]
  )

  const askAgent = useCallback(
    async (prompt: string): Promise<AgentResult> => {
      const flow = await ensureFlow()
      const payload = await fetchJson<{
        edits?: PlannerEdit[]
        prerequisites?: string[]
        rationale?: string
        workflowName?: string
      }>(flowApiUrl(flowId, '/edits'), {
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
          `${flowApiUrl(flowId, '/apply-edits')}`,
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
    async (type: string, position?: XYPosition, nodeId?: string) => {
      // Generate ID if not provided, so caller can know the ID before it's created
      const id = nodeId ?? generateId(type.replace(/\W+/g, "-") || "node")
      const edit = addNodeEdit(type, position, id)
      await applyEdits([edit as PlannerEdit])
      return id
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

  const moveNodes = useCallback(
    async (moves: Array<{ nodeId: string; position: { x: number; y: number } }>) => {
      if (moves.length === 0) return
      const edits: PlannerEdit[] = moves.map((move) => ({
        op: "moveNode" as const,
        nodeId: move.nodeId,
        position: move.position,
      }))
      await applyEdits(edits)
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
      const payload = await fetchJson<{ runId: string }>(flowApiUrl(flowId, '/runs'), {
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
        `/workflows/api/runs/${targetRun}/nodes/${nodeId}/run-from-here`,
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

      const payload = await fetchJson<{ run: RunDetails }>(`/workflows/api/runs/${targetRun}`)
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
        `/workflows/api/runs/${targetRun}/nodes/${nodeId}`
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
      `/workflows/api/secrets`
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
      const payload = await fetchJson<{ ok: boolean; secret: { id: string; name: string } }>(`/workflows/api/secrets`, {
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
      const payload = await fetchJson<any>(flowApiUrl(flowId, '/estimate'))
      return payload
    } catch (error) {
      console.warn("[useFlowV2Builder] estimate unavailable", error)
      return null
    }
  }, [flowId])

  const publish = useCallback(async () => {
    const payload = await fetchJson<{ revisionId: string }>(flowApiUrl(flowId, '/publish'), {
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

  const loadRevision = useCallback(
    async (revisionId: string) => {
      setLoading(true)
      try {
        const payload = await fetchJson<{ revision: { id: string; flowId: string; graph: Flow; version?: number } }>(
          `${flowApiUrl(flowId, `/revisions/${revisionId}`)}`
        )
        const flow = FlowSchema.parse(payload.revision.graph)
        setFlowFromRevision(flow, payload.revision.id, payload.revision.version)
        void syncLatestRunId()
        return flow
      } catch (error: any) {
        const message = error?.message ?? "Failed to load revision"
        setFlowState((prev) => ({
          ...prev,
          error: message,
        }))
        throw error
      } finally {
        setLoading(false)
      }
    },
    [flowId, setFlowFromRevision, setLoading, syncLatestRunId]
  )

  const actions = useMemo<FlowV2BuilderActions>(
    () => ({
      load,
      loadRevision,
      applyEdits,
      askAgent,
      updateConfig,
      updateFlowName,
      addNode,
      deleteNode,
      moveNodes,
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
      loadRevision,
      moveNodes,
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
