"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import {
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Edge as ReactFlowEdge,
  type Node as ReactFlowNode,
  type XYPosition,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
} from "@xyflow/react"

import { logger } from '@/lib/utils/logger'
import { FlowSchema, type Flow, type FlowInterface, type Node as FlowNode, type Edge as FlowEdge } from "./schema"
import { addNodeEdit, oldConnectToEdge, generateId } from "../compat/v2Adapter"
import { ALL_NODE_COMPONENTS } from "../../../../lib/workflows/nodes"
import { flowApiUrl } from "./api/paths"

// Node components for nodeTypes
import CustomNode from "@/components/workflows/CustomNode"
import { AddActionNode } from "@/components/workflows/AddActionNode"
import { ChainPlaceholderNode } from "@/components/workflows/ChainPlaceholderNode"
import InsertActionNode from "@/components/workflows/InsertActionNode"
import { TriggerPlaceholderNode } from "@/components/workflows/nodes/TriggerPlaceholderNode"
import { ActionPlaceholderNode } from "@/components/workflows/nodes/ActionPlaceholderNode"

// Edge component for edgeTypes
import { FlowEdge as FlowEdgeComponent } from "@/components/workflows/builder/FlowEdges"

const LINEAR_STACK_X = 400
const DEFAULT_VERTICAL_SPACING = 180

export interface UseFlowV2BuilderOptions {
  initialPrompt?: string
  autoOpenAgentPanel?: boolean
  initialRevision?: any // Pre-fetched revision data from server
  initialStatus?: 'draft' | 'active' | 'inactive' // Pre-fetched workflow status from server
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
  | { op: "replaceNode"; oldNodeId: string; newNode: FlowNode; preserveConfig?: string[] }
  | { op: "disconnectEdge"; sourceId: string; targetId: string }

interface AgentResult {
  edits: PlannerEdit[]
  prerequisites: string[]
  rationale?: string
  workflowName?: string
  /** Unsupported features detected in the prompt */
  unsupportedFeatures?: {
    hasUnsupported: boolean
    features: Array<{ feature: string; alternative?: string }>
    message: string
  }
  /** Task cost for AI workflow creation */
  taskCost?: {
    tasksUsed: number
    breakdown: { base: number; complexity: number; total: number }
    remainingBalance?: number | null
    message?: string
  }
  /** Whether this result came from template cache */
  fromCache?: boolean
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
  workflowStatus: 'draft' | 'active' | 'inactive' | null
  isUpdatingStatus: boolean
  triggerActivationError?: { message: string; details: string | string[] } | null
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
  replaceNode: (oldNodeId: string, newType: string, position?: XYPosition, preserveConfig?: string[]) => Promise<string>
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
  activateWorkflow: () => Promise<{ success: boolean; message?: string }>
  deactivateWorkflow: () => Promise<{ success: boolean; message?: string }>
}

export interface UseFlowV2BuilderResult {
  // React Flow state
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
  setNodes: (update: ReactFlowNode[] | ((nodes: ReactFlowNode[]) => ReactFlowNode[])) => void
  setEdges: (update: ReactFlowEdge[] | ((edges: ReactFlowEdge[]) => ReactFlowEdge[])) => void
  onNodesChange: OnNodesChange<ReactFlowNode>
  onEdgesChange: OnEdgesChange<ReactFlowEdge>
  onConnect: (connection: Connection) => void
  nodeTypes: Record<string, any>
  edgeTypes: Record<string, any>
  fitView: (options?: any) => void
  getNodes: () => ReactFlowNode[]
  getEdges: () => ReactFlowEdge[]

  // Utility functions
  updateNodeData: (nodeId: string, data: Partial<any>) => void

  // Workflow metadata
  workflowName: string
  setWorkflowName: (name: string) => void
  hasUnsavedChanges: boolean
  setHasUnsavedChanges: (value: boolean) => void

  // V2-specific state and actions
  flowState: FlowV2BuilderState
  actions: FlowV2BuilderActions

  // Loading guard ref
  isInitialLoadCompleteRef: MutableRefObject<boolean>
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
    logger.warn("[useFlowV2Builder] Skipping reorder due to branching connections", {
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
      id: generateId(), // Use UUID for database compatibility (workflow_edges.id is uuid type)
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
            id: generateId(), // Use UUID for database compatibility (workflow_edges.id is uuid type)
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
      case "disconnectEdge": {
        working.edges = working.edges.filter(
          (edge) => !(edge.from.nodeId === edit.sourceId && edge.to.nodeId === edit.targetId)
        )
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
      case "replaceNode": {
        // Atomic node replacement - avoids intermediate "no trigger" state
        const oldNode = working.nodes.find((node) => node.id === edit.oldNodeId)
        if (!oldNode) {
          logger.warn(`[applyPlannerEdits] replaceNode: old node ${edit.oldNodeId} not found`)
          break
        }

        // Preserve specified config fields from old node (default: integration_id)
        const preservedConfig: Record<string, any> = {}
        if (edit.preserveConfig && oldNode.config) {
          for (const key of edit.preserveConfig) {
            if (oldNode.config[key] !== undefined) {
              preservedConfig[key] = oldNode.config[key]
            }
          }
        }

        // Get old node's position
        const oldPosition = (oldNode.metadata as any)?.position

        // Create new node with preserved config and old position
        const newNode: FlowNode = {
          ...edit.newNode,
          config: {
            ...(edit.newNode.config ?? {}),
            ...preservedConfig,
          },
          metadata: {
            ...(edit.newNode.metadata ?? {}),
            position: oldPosition ?? (edit.newNode.metadata as any)?.position,
          },
        }

        // Update edges to point to the new node ID (in place, not delete+recreate)
        for (const edge of working.edges) {
          if (edge.to.nodeId === edit.oldNodeId) {
            edge.to = { ...edge.to, nodeId: newNode.id }
          }
          if (edge.from.nodeId === edit.oldNodeId) {
            edge.from = { ...edge.from, nodeId: newNode.id }
          }
        }

        // Remove old node and add new node atomically
        working.nodes = working.nodes.filter((node) => node.id !== edit.oldNodeId)
        working.nodes.push(newNode)

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
  // First, determine which nodes are triggers and assign STABLE fallback positions
  // CRITICAL: Assign fallbackY BEFORE sorting to prevent multiple nodes from getting
  // the same Y position when metadata.position is undefined. This fixes the overlapping bug.
  const nodeWithTriggerInfo = flow.nodes.map((node, originalIndex) => {
    const metadata = (node.metadata ?? {}) as any
    const catalogNode = NODE_COMPONENT_MAP.get(node.type)

    // Debug: Log when catalog lookup fails
    if (!catalogNode) {
      logger.warn(`[flowToReactFlowNodes] Node type not found in catalog: "${node.type}"`, {
        nodeId: node.id,
        nodeType: node.type,
        availableTypes: Array.from(NODE_COMPONENT_MAP.keys()).slice(0, 10), // First 10 for brevity
      })
    }

    const isTrigger = metadata.isTrigger ?? catalogNode?.isTrigger ?? false
    // Pre-calculate fallback Y based on ORIGINAL array order (not sorted order)
    const fallbackY = 120 + originalIndex * 180
    return { node, isTrigger, metadata, catalogNode, fallbackY }
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

  return sortedNodes.map(({ node, isTrigger, metadata, catalogNode, fallbackY }) => {
    // Use the pre-calculated fallbackY from the original order (before sorting)
    const rawPosition = metadata.position ?? { x: LINEAR_STACK_X, y: fallbackY }
    // Use saved X position if available, otherwise default to LINEAR_STACK_X
    const positionX = rawPosition.x ?? LINEAR_STACK_X
    const positionY = rawPosition.y ?? fallbackY
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
      logger.warn(`[flowToReactFlowEdges] Skipping duplicate edge: ${key} (id: ${edge.id})`)
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
 * Cleans up stale/transitive edges left over from a pre-fix insertion bug.
 *
 * The old insertion code added A→NewNode and NewNode→B edges but never removed
 * the original A→B edge.  This function detects edges that are "shortcuts" over
 * an intermediate path and removes them so the workflow renders as a clean chain.
 *
 * Only applies to non-branching source nodes (skips path / ai_router nodes).
 */
function cleanupStaleEdges(
  edges: ReactFlowEdge[],
  nodes: ReactFlowNode[]
): ReactFlowEdge[] {
  // Build adjacency: source → [targets]
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.source) || []
    targets.push(edge.target)
    outgoing.set(edge.source, targets)
  }

  // Quick BFS reachability check (bounded depth to avoid cycles)
  function isReachable(from: string, to: string, maxDepth = 10): boolean {
    if (maxDepth <= 0) return false
    const targets = outgoing.get(from)
    if (!targets) return false
    for (const t of targets) {
      if (t === to) return true
      if (isReachable(t, to, maxDepth - 1)) return true
    }
    return false
  }

  const staleKeys = new Set<string>()

  for (const [source, targets] of outgoing) {
    if (targets.length <= 1) continue

    // Don't touch branching nodes (path / ai_router) – they legitimately fan-out
    const sourceNode = nodes.find((n) => n.id === source)
    const nodeType = (sourceNode?.data as any)?.type
    if (nodeType === "path" || nodeType === "ai_router") continue

    // For every pair, check if one target is reachable from the other
    for (const tA of targets) {
      for (const tB of targets) {
        if (tA === tB) continue
        // If tA can reach tB, then source→tB is the stale "shortcut"
        if (isReachable(tA, tB)) {
          staleKeys.add(`${source}->${tB}`)
        }
      }
    }
  }

  if (staleKeys.size > 0) {
    logger.debug(
      `[cleanupStaleEdges] Removing ${staleKeys.size} stale edge(s):`,
      Array.from(staleKeys)
    )
  }

  return edges.filter((e) => !staleKeys.has(`${e.source}->${e.target}`))
}

/**
 * Normalizes positions for simple linear (chain) workflows.
 *
 * Walks the edge chain from the root node and re-spaces every node at
 * DEFAULT_VERTICAL_SPACING (180 px) intervals, keeping the root node's
 * position as the anchor.  Non-linear workflows (branches, multiple
 * incoming/outgoing edges) are left untouched.
 */
function normalizeLinearPositions(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[]
): void {
  if (nodes.length < 2) return

  // Build maps
  const outgoing = new Map<string, string>()  // source → single target
  const incoming = new Map<string, string>()  // target → single source
  let isLinear = true

  for (const edge of edges) {
    // Skip placeholder edges
    if (edge.source.includes("placeholder") || edge.target.includes("placeholder")) continue

    if (outgoing.has(edge.source)) {
      isLinear = false
      break
    }
    if (incoming.has(edge.target)) {
      isLinear = false
      break
    }
    outgoing.set(edge.source, edge.target)
    incoming.set(edge.target, edge.source)
  }

  if (!isLinear) return

  // Find root: a real node with no incoming edge
  const realNodes = nodes.filter(
    (n) => !n.id.includes("placeholder") && n.type !== "trigger_placeholder" && n.type !== "action_placeholder"
  )
  const root = realNodes.find((n) => !incoming.has(n.id))
  if (!root) return

  // Walk the chain
  const ordered: ReactFlowNode[] = [root]
  let current = root
  while (outgoing.has(current.id)) {
    const nextId = outgoing.get(current.id)!
    const next = nodes.find((n) => n.id === nextId)
    if (!next || ordered.includes(next)) break
    ordered.push(next)
    current = next
  }

  // Only normalize if the entire chain was walked (all real nodes accounted for)
  if (ordered.length !== realNodes.length) return

  // Check if positions actually need fixing (detect overlaps or inconsistent gaps)
  let needsFix = false
  for (let i = 1; i < ordered.length; i++) {
    const gap = ordered[i].position.y - ordered[i - 1].position.y
    // Bad if: overlap, too close, too far, or X misaligned
    if (gap < 100 || gap > DEFAULT_VERTICAL_SPACING * 1.5 || ordered[i].position.x !== ordered[0].position.x) {
      needsFix = true
      break
    }
  }

  if (!needsFix) return

  logger.debug(
    `[normalizeLinearPositions] Re-spacing ${ordered.length} nodes in linear chain`
  )

  const baseX = ordered[0].position.x
  const baseY = ordered[0].position.y

  for (let i = 1; i < ordered.length; i++) {
    const newPos = { x: baseX, y: baseY + i * DEFAULT_VERTICAL_SPACING }
    ordered[i].position = newPos
    ;(ordered[i] as any).positionAbsolute = newPos
  }
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
      logger.debug(`[detectMissingEdges] Found missing edge: ${current.id} -> ${next.id}`)
      missingEdges.push({
        op: "connect",
        edge: {
          id: generateId(), // Use UUID for database compatibility (workflow_edges.id is uuid type)
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
    logger.debug(`${ALIGNMENT_LOG_PREFIX} ${label}`)
    return
  }
  logger.debug(`${ALIGNMENT_LOG_PREFIX} ${label}: ${JSON.stringify(payload, null, 2)}`)
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
  // React Flow state - no longer depending on useWorkflowBuilder
  const [nodes, setNodesInternal, onNodesChange] = useNodesState<ReactFlowNode>([])
  const [edges, setEdgesInternal, onEdgesChange] = useEdgesState<ReactFlowEdge>([])
  const { fitView, getNodes, getEdges } = useReactFlow()

  // Wrapped setNodes with sanitization
  const setNodes = useCallback((update: ReactFlowNode[] | ((nodes: ReactFlowNode[]) => ReactFlowNode[])) => {
    setNodesInternal((currentNodes) => {
      const nextNodes = typeof update === 'function' ? update(currentNodes) : update
      // Sanitize: remove undefined/null nodes
      return nextNodes.filter((n: any) => n != null)
    })
  }, [setNodesInternal])

  // Wrapped setEdges with sanitization
  const setEdges = useCallback((update: ReactFlowEdge[] | ((edges: ReactFlowEdge[]) => ReactFlowEdge[])) => {
    setEdgesInternal((currentEdges) => {
      const nextEdges = typeof update === 'function' ? update(currentEdges) : update
      // Sanitize: remove undefined/null edges
      return nextEdges.filter((e: any) => e != null)
    })
  }, [setEdgesInternal])

  // Node and edge types for React Flow
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
    addAction: AddActionNode,
    chainPlaceholder: ChainPlaceholderNode,
    insertAction: InsertActionNode,
    trigger_placeholder: TriggerPlaceholderNode,
    action_placeholder: ActionPlaceholderNode,
  }), [])

  const edgeTypes = useMemo(() => ({
    custom: FlowEdgeComponent,
  }), [])

  // Utility function to update a single node's data
  const updateNodeData = useCallback((nodeId: string, data: Partial<any>) => {
    setNodes((nds: ReactFlowNode[]) => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
    ))
  }, [setNodes])

  // Connection handler for when user connects two nodes
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    setEdges((eds: ReactFlowEdge[]) => [
      ...eds,
      {
        id: `e-${connection.source}-${connection.target}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        type: 'custom',
      }
    ])
  }, [setEdges])

  // Workflow metadata state
  const [workflowName, setWorkflowName] = useState("Untitled Flow")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

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
    workflowStatus: options?.initialStatus || null,
    isUpdatingStatus: false,
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

  // Track when initial load is complete to prevent competing setNodes calls
  // This ref is exposed to consumers (e.g., WorkflowBuilderV2) so they can
  // gate their useEffects that touch nodes until initial load is done
  const isInitialLoadCompleteRef = useRef<boolean>(false)

  // Guard to prevent concurrent load calls (e.g., from React StrictMode double-invoke)
  const isLoadInProgressRef = useRef<boolean>(false)

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

      // --- Fix pre-existing workflows ---
      // 1. Remove stale transitive edges (A→B when A→C→B exists) from old insertion bug
      edges = cleanupStaleEdges(edges, graphNodes)
      // 2. Re-space linear chains evenly if they have overlaps or inconsistent gaps
      normalizeLinearPositions(graphNodes, edges)

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
      } else if (flow.nodes.length > 0) {
        // Check if there's a real trigger node (not a placeholder)
        const hasTrigger = flow.nodes.some((node) => {
          const nodeDef = ALL_NODE_COMPONENTS.find(c => c.type === node.type)
          return node.metadata?.isTrigger || nodeDef?.isTrigger || false
        })

        if (!hasTrigger) {
          // No trigger - add trigger placeholder above the topmost node
          const sortedNodes = [...graphNodes].sort((a, b) => a.position.y - b.position.y)
          const topNode = sortedNodes[0]

          if (topNode) {
            const triggerPlaceholder: ReactFlowNode = {
              id: 'trigger-placeholder',
              type: 'trigger_placeholder',
              position: {
                x: topNode.position.x,
                y: topNode.position.y - 180
              },
              data: {
                type: 'trigger_placeholder',
                isPlaceholder: true,
                title: 'Trigger',
              },
            }

            graphNodes = [triggerPlaceholder, ...graphNodes]

            edges.push({
              id: `trigger-placeholder-${topNode.id}`,
              source: 'trigger-placeholder',
              target: topNode.id,
              sourceHandle: 'source',
              targetHandle: 'target',
              type: 'custom',
              style: { stroke: '#d0d6e0' },
            } as ReactFlowEdge)
          }
        } else if (flow.nodes.length === 1 && !hasHadActionNodeRef.current) {
          // Has trigger but only 1 node and never had action - add action placeholder
          const triggerNode = graphNodes[0]
          if (triggerNode) {
            const actionPlaceholder: ReactFlowNode = {
              id: 'action-placeholder',
              type: 'action_placeholder',
              position: {
                x: triggerNode.position.x,
                y: triggerNode.position.y + 180
              },
              data: {
                type: 'action_placeholder',
                isPlaceholder: true,
                title: 'Action',
              },
            }

            graphNodes.push(actionPlaceholder)

            edges.push({
              id: `${triggerNode.id}-action-placeholder`,
              source: triggerNode.id,
              target: 'action-placeholder',
              sourceHandle: 'source',
              targetHandle: 'target',
              type: 'custom',
              style: { stroke: '#d0d6e0' },
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

        // Build sets of nodes that already have explicit edges for conservative synthetic creation
        const nodesWithOutgoing = new Set(edges.map(e => e.source))
        const nodesWithIncoming = new Set(edges.map(e => e.target))

        for (let i = 0; i < sortedLinearNodes.length - 1; i++) {
          const current = sortedLinearNodes[i]
          const next = sortedLinearNodes[i + 1]
          const key = `${current.id}->${next.id}`
          if (existingEdges.has(key)) {
            continue
          }

          // Don't create synthetic edges if either node already has explicit connections
          // This prevents duplicating edges when nodes are connected via non-adjacent paths
          // (e.g., after insertion where NodeA→NewNode→NodeB, don't also create NodeA→NodeB)
          if (nodesWithOutgoing.has(current.id) || nodesWithIncoming.has(next.id)) {
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
          nodesWithOutgoing.add(current.id)
          nodesWithIncoming.add(next.id)
        }
      }

      setNodes(graphNodes)

      // Deduplicate edges by ID to prevent "duplicate key" React errors
      const seenEdgeIds = new Set<string>()
      const deduplicatedEdges = edges.filter(edge => {
        if (seenEdgeIds.has(edge.id)) {
          logger.warn(`[updateReactFlowGraph] Skipping duplicate edge ID: ${edge.id}`)
          return false
        }
        seenEdgeIds.add(edge.id)
        return true
      })

      setEdges(deduplicatedEdges)
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

    // Prevent concurrent loads (e.g., from React StrictMode double-invoke)
    if (isLoadInProgressRef.current) {
      logger.debug('[useFlowV2Builder] Load already in progress, skipping duplicate call')
      return
    }
    isLoadInProgressRef.current = true

    // Helper to auto-deactivate workflow if it's marked active but has no triggers
    // This handles edge cases where the workflow state is inconsistent
    const autoDeactivateIfNeeded = async (flow: Flow, status: string) => {
      if (status !== 'active') return status

      // Check if the flow has any trigger nodes
      const hasTriggers = (flow.nodes || []).some((n: any) => n.metadata?.isTrigger)
      if (hasTriggers) return status

      // No triggers but marked active - auto-deactivate
      logger.debug(`[useFlowV2Builder] Auto-deactivating workflow ${flowId} - no triggers but marked active`)
      try {
        const response = await fetch(`/api/workflows/${flowId}/deactivate`, {
          method: 'POST',
          credentials: 'include',
        })
        if (response.ok) {
          logger.debug(`[useFlowV2Builder] Successfully auto-deactivated workflow ${flowId}`)
          return 'draft'
        }
      } catch (error) {
        console.error('[useFlowV2Builder] Failed to auto-deactivate workflow:', error)
      }
      return status
    }

    // Helper to repair missing edges in a flow
    const repairFlowEdges = (flow: Flow): { repairedFlow: Flow; hadRepairs: boolean } => {
      const missingEdgeEdits = detectMissingEdges(flow)
      if (missingEdgeEdits.length === 0) {
        return { repairedFlow: flow, hadRepairs: false }
      }

      logger.debug(`[useFlowV2Builder] Repairing ${missingEdgeEdits.length} missing edges`)
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
        logger.debug('[useFlowV2Builder] Successfully persisted repaired flow with edges')
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
        // Use initialStatus if provided from server, otherwise fetch from settings
        let workflowStatus: string = options?.initialStatus || 'draft'
        if (!options?.initialStatus) {
          const settingsResponse = await fetch(`/api/workflows/${flowId}/settings`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
          workflowStatus = settingsResponse?.status || 'draft'
        }

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

        // Mark initial load as complete AFTER updateReactFlowGraph
        // This prevents competing useEffects in WorkflowBuilderV2 from
        // calling setNodes while we're still setting up the initial state
        isInitialLoadCompleteRef.current = true

        // Auto-deactivate if workflow is active but has no triggers
        const correctedStatus = await autoDeactivateIfNeeded(flow, workflowStatus)

        setFlowState((prev) => ({
          ...prev,
          flow,
          revisionId: options.initialRevision.id,
          version: flow.version,
          revisionCount: 1, // We don't have revision count from server, set to 1
          workflowStatus: correctedStatus as 'draft' | 'active' | 'inactive',
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
        isLoadInProgressRef.current = false
      }
      return
    }

    // Otherwise, fetch from API as usual
    setLoading(true)
    try {
      // Use initialStatus if provided, otherwise fetch from settings in parallel with revisions
      let workflowStatus: string = options?.initialStatus || 'draft'
      let revisionsPayload: { revisions?: Array<{ id: string; version: number }> }

      if (options?.initialStatus) {
        // Skip settings fetch when status is provided
        revisionsPayload = await fetchJson<{ revisions?: Array<{ id: string; version: number }> }>(
          `${flowApiUrl(flowId, '/revisions')}`
        )
      } else {
        // Fetch revisions and workflow status in parallel
        const [revPayload, settingsResponse] = await Promise.all([
          fetchJson<{ revisions?: Array<{ id: string; version: number }> }>(
            `${flowApiUrl(flowId, '/revisions')}`
          ),
          fetch(`/api/workflows/${flowId}/settings`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        ])
        revisionsPayload = revPayload
        workflowStatus = settingsResponse?.status || 'draft'
      }

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

      // Mark initial load as complete AFTER updateReactFlowGraph
      isInitialLoadCompleteRef.current = true

      // Auto-deactivate if workflow is active but has no triggers
      const correctedStatus = await autoDeactivateIfNeeded(flow, workflowStatus)

      setFlowState((prev) => ({
        ...prev,
        flow,
        revisionId: revisionPayload.revision.id,
        version: flow.version ?? revisions[0].version,
        revisionCount: revisions.length,
        workflowStatus: correctedStatus as 'draft' | 'active' | 'inactive',
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
      isLoadInProgressRef.current = false
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
          const payload = await fetchJson<{
            flow: Flow
            revisionId?: string
            version?: number
            workflowStatus?: 'draft' | 'active' | 'inactive'
            triggerActivationError?: { message: string; details: string | string[] }
          }>(
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
            // Update workflow status if it changed (e.g., auto-deactivation when trigger is removed)
            ...(payload.workflowStatus ? { workflowStatus: payload.workflowStatus } : {}),
            // Propagate trigger activation error so the UI can show a toast
            triggerActivationError: payload.triggerActivationError || null,
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
        ok?: boolean
        edits?: PlannerEdit[]
        prerequisites?: string[]
        rationale?: string
        workflowName?: string
        unsupportedFeatures?: {
          hasUnsupported: boolean
          features: Array<{ feature: string; alternative?: string }>
          message: string
        }
        taskCost?: {
          tasksUsed: number
          breakdown: { base: number; complexity: number; total: number }
          remainingBalance?: number | null
          message?: string
        }
        taskLimitExceeded?: boolean
        tasksUsed?: number
        tasksLimit?: number
        fromCache?: boolean
        errors?: string[]
      }>(flowApiUrl(flowId, '/edits'), {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          prompt,
          flow,
        }),
      }, 60000) // 60 second timeout for LLM planning

      // Handle task limit exceeded
      if (payload.taskLimitExceeded) {
        throw new Error(
          `Task limit exceeded. You have used ${payload.tasksUsed ?? 0} of ${payload.tasksLimit ?? 100} tasks this month. ` +
          `Please upgrade your plan or wait for the monthly reset.`
        )
      }

      const result: AgentResult = {
        edits: payload.edits ?? [],
        prerequisites: payload.prerequisites ?? [],
        rationale: payload.rationale,
        workflowName: payload.workflowName,
        unsupportedFeatures: payload.unsupportedFeatures,
        taskCost: payload.taskCost,
        fromCache: payload.fromCache,
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
      logger.debug('[useFlowV2Builder] updateFlowName called with:', name)
      const baseFlow = await ensureFlow()
      const trimmed = name.trim()
      logger.debug('[useFlowV2Builder] Current flow name:', baseFlow.name, '| New trimmed name:', trimmed)

      if (!trimmed || baseFlow.name === trimmed) {
        logger.debug('[useFlowV2Builder] ⚠️ Skipping update - name is empty or unchanged')
        return
      }

      const nextFlow = cloneFlow(baseFlow)
      nextFlow.name = trimmed
      nextFlow.version = (nextFlow.version ?? 0) + 1
      logger.debug('[useFlowV2Builder] Preparing to update flow name to:', trimmed, '| New version:', nextFlow.version)

      setSaving(true)
      try {
        logger.debug('[useFlowV2Builder] Calling /apply-edits API...')
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
        logger.debug('[useFlowV2Builder] ✅ API call succeeded, received flow with name:', payload.flow.name)

        const updatedFlow = FlowSchema.parse(payload.flow)
        flowRef.current = updatedFlow
        revisionIdRef.current = payload.revisionId ?? revisionIdRef.current
        updateReactFlowGraph(updatedFlow)
        logger.debug('[useFlowV2Builder] ✅ Updated refs and graph')

        setFlowState((prev) => ({
          ...prev,
          flow: updatedFlow,
          revisionId: payload.revisionId ?? prev.revisionId,
          version: updatedFlow.version ?? payload.version ?? prev.version,
          revisionCount: (prev.revisionCount ?? 0) + 1,
        }))
        logger.debug('[useFlowV2Builder] ✅ Updated flowState with new name:', updatedFlow.name)
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

  const replaceNode = useCallback(
    async (oldNodeId: string, newType: string, position?: XYPosition, preserveConfig?: string[]) => {
      // Generate new ID for the replacement node
      const newId = generateId(newType.replace(/\W+/g, "-") || "node")

      // Create the new node structure using addNodeEdit helper
      const addEdit = addNodeEdit(newType, position, newId)

      // Create atomic replaceNode edit - preserves config (like integration_id) and updates edges in place
      const edit: PlannerEdit = {
        op: "replaceNode",
        oldNodeId,
        newNode: addEdit.node,
        preserveConfig: preserveConfig ?? ['integration_id'], // Default to preserving integration_id
      }

      await applyEdits([edit])
      return newId
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
      logger.warn("[useFlowV2Builder] estimate unavailable", error)
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

  const activateWorkflow = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    if (!flowId) return { success: false, message: 'No workflow ID' }

    setFlowState((prev) => ({ ...prev, isUpdatingStatus: true }))

    try {
      const res = await fetch(`/api/workflows/${flowId}/activate`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Activation failed')

      setFlowState((prev) => ({ ...prev, workflowStatus: 'active' }))
      return { success: true, message: data.activation?.message }
    } catch (e: any) {
      return { success: false, message: e.message }
    } finally {
      setFlowState((prev) => ({ ...prev, isUpdatingStatus: false }))
    }
  }, [flowId])

  const deactivateWorkflow = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    if (!flowId) return { success: false, message: 'No workflow ID' }

    setFlowState((prev) => ({ ...prev, isUpdatingStatus: true }))

    try {
      const res = await fetch(`/api/workflows/${flowId}/deactivate`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Deactivation failed')

      setFlowState((prev) => ({ ...prev, workflowStatus: 'inactive' }))
      return { success: true, message: data.deactivation?.message }
    } catch (e: any) {
      return { success: false, message: e.message }
    } finally {
      setFlowState((prev) => ({ ...prev, isUpdatingStatus: false }))
    }
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
      replaceNode,
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
      activateWorkflow,
      deactivateWorkflow,
    }),
    [
      activateWorkflow,
      addNode,
      applyEdits,
      askAgent,
      connectEdge,
      createSecret,
      deactivateWorkflow,
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
      replaceNode,
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

  // Flush pending config changes on page unload using sendBeacon
  // This ensures config changes are saved even if the user refreshes before debounce completes
  useEffect(() => {
    const handleBeforeUnload = () => {
      const pendingEntries = Array.from(pendingConfigRef.current.entries())
      if (pendingEntries.length === 0 || !flowRef.current) {
        return
      }

      // Clear the debounce timer since we're flushing now
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }

      // Build the edits
      const edits = pendingEntries.map(([nodeId, patch]) => ({
        op: "setConfig",
        nodeId,
        patch,
      }))

      // Apply edits to the current flow
      const baseFlow = flowRef.current
      const nextFlow = applyPlannerEdits(baseFlow, edits as PlannerEdit[])

      // Use sendBeacon for reliable delivery on page unload
      // This is the recommended way to save data when the page is being closed
      const url = `${flowApiUrl(flowId, '/apply-edits')}`
      const blob = new Blob([JSON.stringify({
        flow: nextFlow,
        version: nextFlow.version,
      })], { type: 'application/json' })

      navigator.sendBeacon(url, blob)
      logger.debug('[useFlowV2Builder] Flushed pending config via sendBeacon on page unload')

      // Clear the pending config
      pendingConfigRef.current = new Map()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [flowId])

  return {
    // React Flow state
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    nodeTypes,
    edgeTypes,
    fitView,
    getNodes,
    getEdges,

    // Utility functions
    updateNodeData,

    // Workflow metadata
    workflowName,
    setWorkflowName,
    hasUnsavedChanges,
    setHasUnsavedChanges,

    // V2-specific state and actions
    flowState,
    actions,

    // Expose the loading guard ref so consumers can gate their useEffects
    isInitialLoadCompleteRef,
  }
}
