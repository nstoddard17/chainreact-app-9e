import { useMemo } from "react"

import { useFlowV2Builder } from "./useFlowV2Builder"

interface LegacyNodeData {
  id: string
  title: string
  type: string
  providerId?: string
  isTrigger?: boolean
  config: Record<string, any>
  description?: string
  agentHighlights?: string[]
}

interface LegacyNode {
  id: string
  position: { x: number; y: number }
  data: LegacyNodeData
}

interface LegacyEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

interface LegacyAdapterState {
  nodes: LegacyNode[]
  edges: LegacyEdge[]
  flowName: string
  prerequisites: string[]
}

interface LegacyAdapterActions {
  askAgent: (prompt: string) => Promise<any>
  applyEdits: (edits: any[]) => Promise<void>
  updateConfig: (nodeId: string, patch: Record<string, any>) => void
  addNode: (type: string, position?: { x: number; y: number }) => Promise<void>
  connectEdge: (link: {
    sourceId: string
    targetId: string
    sourceHandle?: string
    targetHandle?: string
  }) => Promise<void>
  run: (inputs: any) => Promise<{ runId: string }>
  runFromHere: (nodeId: string) => Promise<{ runId: string }>
  refreshRun: (runId?: string) => Promise<any>
  getNodeSnapshot: (nodeId: string, runId?: string) => Promise<any>
  updateFlowName: (name: string) => Promise<void>
  estimate: () => Promise<any | null>
  publish: () => Promise<{ revisionId: string }>
  listSecrets: () => Promise<Array<{ id: string; name: string }>>
  createSecret: (name: string, value: string) => Promise<void>
}

export interface UseFlowV2LegacyAdapterResult {
  state: LegacyAdapterState
  actions: LegacyAdapterActions | null
  flowState: ReturnType<typeof useFlowV2Builder> | null
}

function mapNodes(nodes: any[]): LegacyNode[] {
  return nodes.map((node) => ({
    id: node.id,
    position: node.position ?? { x: 160, y: 120 },
    data: {
      id: node.id,
      title: node.data?.title ?? node.data?.label ?? node.data?.type ?? "Node",
      type: node.data?.type ?? "unknown",
      providerId: node.data?.providerId,
      isTrigger: node.data?.isTrigger ?? false,
      config: node.data?.config ?? {},
      description: node.data?.description,
      agentHighlights: node.data?.agentHighlights ?? [],
    },
  }))
}

function mapEdges(edges: any[]): LegacyEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  }))
}

export function useFlowV2LegacyAdapter(flowId: string) {
  const builder = useFlowV2Builder(flowId)

  const state = useMemo<LegacyAdapterState>(() => {
    if (!builder) {
      return {
        nodes: [],
        edges: [],
        flowName: "Untitled Flow",
        prerequisites: [],
      }
    }

    return {
      nodes: mapNodes(builder.nodes ?? []),
      edges: mapEdges(builder.edges ?? []),
      flowName: builder.flowState?.flow?.name ?? "Untitled Flow",
      prerequisites: builder.flowState?.agentPrerequisites ?? [],
    }
  }, [builder])

  const actions: LegacyAdapterActions | null = builder
    ? {
        askAgent: builder.actions.askAgent,
        applyEdits: async (edits) => {
          await builder.actions.applyEdits(edits)
        },
        updateConfig: builder.actions.updateConfig,
        addNode: builder.actions.addNode,
        connectEdge: builder.actions.connectEdge,
        run: builder.actions.run,
        runFromHere: builder.actions.runFromHere,
        refreshRun: builder.actions.refreshRun,
        getNodeSnapshot: builder.actions.getNodeSnapshot,
        updateFlowName: builder.actions.updateFlowName,
        estimate: builder.actions.estimate,
        publish: builder.actions.publish,
        listSecrets: builder.actions.listSecrets,
        createSecret: builder.actions.createSecret,
      }
    : null

  return {
    state,
    actions,
    flowState: builder,
  }
}
