"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { v4 as uuidv4 } from "uuid"
import Link from "next/link"
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  addEdge,
  type Edge as ReactFlowEdge,
  type Node as ReactFlowNode,
  type Connection,
  useEdgesState,
  useNodesState,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { extractSecretName } from "@/src/lib/workflows/builder/secrets"

import { Flow, FlowSchema, Node as FlowNode, Edge as FlowEdge } from "@/src/lib/workflows/builder/schema"
import { NODES } from "@/src/lib/workflows/builder/nodes"
import type { NodeDefinition } from "@/src/lib/workflows/builder/nodes/types"
import { registerDefaultNodes } from "@/src/lib/workflows/builder/nodes/register"
import { recordRunFailure, type FailureTracker } from "@/src/lib/workflows/builder/alerts"

const DEFAULT_POSITION = { x: 120, y: 120 }

interface FlowRevisionSummary {
  id: string
  version: number
  createdAt: string
  published: boolean
  publishedAt?: string | null
}

interface FlowBuilderClientProps {
  initialFlow: Flow
  revisionId: string
  publishedRevisionId?: string | null
  revisions: FlowRevisionSummary[]
}

interface PlannerResult {
  edits: Array<any>
  prerequisites: string[]
  rationale: string
}

interface RunSnapshot {
  node_id: string
  status: string
  input: any
  output: any
  error: any
  attempts: number
  duration_ms: number | null
  cost: number | null
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
  nodes: RunSnapshot[]
  logs: RunLogEntry[]
  summary: RunSummary
}

interface NodeInspectorState {
  config: Record<string, any>
  schema: NodeDefinition | null
}

function toReactFlowNodes(flow: Flow): ReactFlowNode[] {
  return flow.nodes.map((node, index) => {
    const position = (node.metadata as any)?.position ?? {
      x: DEFAULT_POSITION.x + index * 250,
      y: DEFAULT_POSITION.y,
    }
    return {
      id: node.id,
      data: {
        label: node.label,
        type: node.type,
        config: node.config,
        agentHighlights: (node.metadata as any)?.agentHighlights ?? [],
      },
      position,
    }
  })
}

function toReactFlowEdges(flow: Flow): ReactFlowEdge[] {
  return flow.edges.map((edge) => ({
    id: edge.id,
    source: edge.from.nodeId,
    target: edge.to.nodeId,
    data: { mappings: edge.mappings ?? [] },
  }))
}

function toFlow(graphNodes: ReactFlowNode[], graphEdges: ReactFlowEdge[], flow: Flow): Flow {
  const nextFlow: Flow = JSON.parse(JSON.stringify(flow))
  nextFlow.nodes = graphNodes.map((node) => {
    const definition = NODES[node.data?.type as string]
    const existing = flow.nodes.find((n) => n.id === node.id)
    return {
      id: node.id,
      type: node.data?.type ?? existing?.type ?? "unknown",
      label: node.data?.label ?? existing?.label ?? "Node",
      config: node.data?.config ?? existing?.config ?? {},
      inPorts: existing?.inPorts ?? [],
      outPorts: existing?.outPorts ?? [],
      io: existing?.io ?? { inputSchema: undefined, outputSchema: undefined },
      policy: existing?.policy ?? { timeoutMs: 60000, retries: 0 },
      costHint: definition?.costHint ?? existing?.costHint ?? 0,
      metadata: {
        ...(existing?.metadata ?? {}),
        position: node.position,
        agentHighlights: node.data?.agentHighlights ?? [],
      },
    }
  })

  nextFlow.edges = graphEdges.map((edge) => {
    const existing = flow.edges.find((e) => e.id === edge.id)
    return {
      id: edge.id,
      from: { nodeId: edge.source },
      to: { nodeId: edge.target },
      mappings: existing?.mappings ?? edge.data?.mappings ?? [],
    }
  })

  return nextFlow
}

function applyEditsLocally(flow: Flow, edits: PlannerResult["edits"]) {
  const working: Flow = JSON.parse(JSON.stringify(flow))

  edits.forEach((edit) => {
    switch (edit.op) {
      case "addNode": {
        working.nodes.push(edit.node)
        break
      }
      case "connect": {
        if (!working.edges.find((edge) => edge.id === edit.edge.id)) {
          working.edges.push(edit.edge)
        }
        break
      }
      case "setConfig": {
        const target = working.nodes.find((node) => node.id === edit.nodeId)
        if (target) {
          target.config = { ...target.config, ...edit.patch }
          const metadata = (target.metadata ?? {}) as any
          metadata.agentHighlights = Array.from(new Set([...(metadata.agentHighlights ?? []), ...Object.keys(edit.patch)]))
          target.metadata = metadata
        }
        break
      }
      case "setInterface": {
        working.interface = {
          ...(working.interface ?? { inputs: [], outputs: [] }),
          inputs: edit.inputs,
          outputs: edit.outputs,
        }
        break
      }
      default:
        break
    }
  })

  return working
}

function useKeyboardShortcuts(onSave: () => void, onDelete: () => void, onUndo: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        onSave()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        onUndo()
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        onDelete()
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onSave, onDelete, onUndo])
}

function NodePalette({ onAdd }: { onAdd: (type: string) => void }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <h3 className="text-sm font-semibold text-muted-foreground">Node Catalog</h3>
      <div className="grid gap-2">
        {Object.values(NODES).map((node) => (
          <Button key={node.type} variant="outline" className="justify-start" onClick={() => onAdd(node.type)}>
            {node.title}
          </Button>
        ))}
      </div>
    </div>
  )
}

function NodeInspector({
  node,
  runDetails,
  lineage,
  logs,
  onConfigChange,
  secrets,
  onRequestNewSecret,
}: {
  node: FlowNode | null
  runDetails: RunSnapshot | null
  lineage: Array<{ edge_id: string; from_node_id: string; target_path: string; expr: string }>
  logs: RunLogEntry[]
  onConfigChange: (config: Record<string, any>) => void
  secrets: Array<{ id: string; name: string; created_at: string }>
  onRequestNewSecret: (field: string) => void
}) {
  const definition = node ? NODES[node.type] : null
  const [configState, setConfigState] = useState<Record<string, any>>(node?.config ?? {})

  useEffect(() => {
    setConfigState(node?.config ?? {})
  }, [node?.id])

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">Select a node to inspect</div>
    )
  }

  const handleConfigChange = (key: string, value: string) => {
    const next = { ...configState, [key]: value }
    setConfigState(next)
    onConfigChange(next)
  }

  const handleSecretSelect = (field: string, name: string) => {
    const placeholder = name ? `{{secret:${name}}}` : ""
    const next = { ...configState, [field]: placeholder }
    setConfigState(next)
    onConfigChange(next)
  }

  const agentHighlights: string[] = ((node.metadata as any)?.agentHighlights ?? []) as string[]

  const configFields = definition && "shape" in definition.configSchema
    ? Object.keys((definition.configSchema as z.ZodObject<any>).shape)
    : Object.keys(configState)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold">{node.label}</h2>
        <p className="text-sm text-muted-foreground">{definition?.description ?? node.type}</p>
        {runDetails && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            <div><span className="font-medium text-foreground">Status:</span> {runDetails.status ?? "unknown"}</div>
            <div><span className="font-medium text-foreground">Attempts:</span> {runDetails.attempts ?? 0}</div>
            <div><span className="font-medium text-foreground">Duration:</span> {runDetails.duration_ms ?? 0} ms</div>
            <div><span className="font-medium text-foreground">Cost:</span> {runDetails.cost ?? 0}</div>
          </div>
        )}
      </div>
      <Tabs defaultValue="config" className="flex-1">
        <TabsList className="grid grid-cols-7">
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="lineage">Lineage</TabsTrigger>
          <TabsTrigger value="cost">Cost</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="h-full flex-1 p-4">
          <ScrollArea className="h-[calc(100vh-260px)]">
            <div className="space-y-3">
              {configFields.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {configFields.map((key) => (
                    <Button
                      key={`anchor-${key}`}
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => {
                        const target = document.getElementById(`config-${key}`)
                        if (target) {
                          target.scrollIntoView({ behavior: "smooth", block: "center" })
                        }
                      }}
                    >
                      {key}
                    </Button>
                  ))}
                </div>
              )}
              {configFields.map((key) => {
                const highlight = agentHighlights.includes(key)
                const isSecret = definition?.secrets?.includes(key)
                const secretName = extractSecretName(configState?.[key])
                return (
                  <div key={key} id={`config-${key}`} className={cn("space-y-1", highlight && "rounded-md border border-primary/60 p-2") }>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">{key}</label>
                      <div className="flex items-center gap-2">
                        {highlight && <Badge variant="secondary">Agent</Badge>}
                        {isSecret && (
                          <Badge variant="outline">Secret</Badge>
                        )}
                      </div>
                    </div>
                    {isSecret ? (
                      <div className="flex items-center gap-2">
                        <Select value={secretName ?? ""} onValueChange={(val) => handleSecretSelect(key, val)}>
                          <SelectTrigger><SelectValue placeholder="Select secret" /></SelectTrigger>
                          <SelectContent>
                            {secrets.map((secret) => (
                              <SelectItem key={secret.id} value={secret.name}>{secret.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" size="sm" variant="outline" onClick={() => onRequestNewSecret(key)}>
                          New
                        </Button>
                      </div>
                    ) : (
                      <Textarea
                        value={configState?.[key] ?? ""}
                        onChange={(event) => handleConfigChange(key, event.target.value)}
                        className="min-h-[80px]"
                      />
                    )}
                  </div>
                )
              })}
              {configFields.length === 0 && (
                <p className="text-sm text-muted-foreground">No configurable fields for this node.</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="input" className="h-full flex-1 p-4">
          <PreJSON data={runDetails?.input} empty="No input captured" />
        </TabsContent>
        <TabsContent value="output" className="h-full flex-1 p-4">
          <PreJSON data={runDetails?.output} empty="No output captured" />
        </TabsContent>
        <TabsContent value="errors" className="h-full flex-1 p-4">
          <PreJSON data={runDetails?.error} empty="No errors" />
        </TabsContent>
        <TabsContent value="lineage" className="h-full flex-1 p-4">
          <ScrollArea className="h-[calc(100vh-260px)] space-y-3">
            {lineage.length === 0 && <p className="text-sm text-muted-foreground">No lineage recorded.</p>}
            {lineage.map((row) => (
              <div key={`${row.edge_id}-${row.target_path}`} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{row.target_path}</div>
                <div className="text-muted-foreground">{row.expr}</div>
                <div className="text-xs text-muted-foreground">From: {row.from_node_id}</div>
              </div>
            ))}
          </ScrollArea>
        </TabsContent>
        <TabsContent value="cost" className="h-full flex-1 p-4">
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Attempts:</span> {runDetails?.attempts ?? 0}</div>
            <div><span className="font-medium">Duration:</span> {runDetails?.duration_ms ?? 0} ms</div>
            <div><span className="font-medium">Cost:</span> {runDetails?.cost ?? 0}</div>
          </div>
        </TabsContent>
        <TabsContent value="logs" className="h-full flex-1 p-4">
          <ScrollArea className="h-[calc(100vh-260px)] space-y-3">
            {logs.length === 0 && <p className="text-sm text-muted-foreground">No logs yet.</p>}
            {logs.map((log) => (
              <div key={log.id} className="rounded-md border p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold uppercase tracking-wide">{log.status}</span>
                  <span className="text-muted-foreground">{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <div>Latency: {log.latency_ms ?? 0} ms</div>
                  <div>Cost: {log.cost ?? 0}</div>
                  <div>Retries: {log.retries ?? 0}</div>
                </div>
              </div>
            ))}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PreJSON({ data, empty }: { data: any; empty: string }) {
  if (!data) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <pre className="max-h-[calc(100vh-260px)] overflow-auto rounded-md bg-muted p-3 text-xs">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

function formatDurationMs(value?: number | null) {
  if (!value) return "0 ms"
  if (value < 1000) return `${value} ms`
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`
  return `${(value / 60_000).toFixed(1)} min`
}

function formatCost(value?: number | null) {
  if (!value) return "0"
  return value.toFixed(4)
}

function formatTimestamp(value?: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString()
}

function FlowBuilderSurface({
  initialFlow,
  revisionId,
  publishedRevisionId,
  revisions,
}: FlowBuilderClientProps) {
  const { toast } = useToast()
  const [flowState, setFlowState] = useState(initialFlow)
  const [nodes, setNodes, onNodesChange] = useNodesState(toReactFlowNodes(initialFlow))
  const [edges, setEdges, onEdgesChange] = useEdgesState(toReactFlowEdges(initialFlow))
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [history, setHistory] = useState<Flow[]>([])
  const [future, setFuture] = useState<Flow[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [agentPrompt, setAgentPrompt] = useState("")
  const [agentResult, setAgentResult] = useState<PlannerResult | null>(null)
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [latestRun, setLatestRun] = useState<RunDetails | null>(null)
  const [activeSnapshot, setActiveSnapshot] = useState<RunSnapshot | null>(null)
  const [lineage, setLineage] = useState<Array<{ edge_id: string; from_node_id: string; target_path: string; expr: string }>>([])
  const [costEstimate, setCostEstimate] = useState<{ estimatedCost: number; breakdown: any[] } | null>(null)
  const [secrets, setSecrets] = useState<Array<{ id: string; name: string; created_at: string }>>([])
  const [secretDialogOpen, setSecretDialogOpen] = useState(false)
  const [newSecretName, setNewSecretName] = useState("")
  const [newSecretValue, setNewSecretValue] = useState("")
  const [prerequisites, setPrerequisites] = useState<string[]>([])
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState(`${initialFlow.name} Template`)
  const [templateDescription, setTemplateDescription] = useState("")
  const [templateTags, setTemplateTags] = useState("")
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [schedules, setSchedules] = useState<Array<{ id: string; cron_expression: string; timezone: string; enabled: boolean; last_run_at?: string | null; next_run_at?: string | null }>>([])
  const [newScheduleCron, setNewScheduleCron] = useState("0 * * * *")
  const [newScheduleTimezone, setNewScheduleTimezone] = useState("UTC")
  const [newScheduleEnabled, setNewScheduleEnabled] = useState(true)
  const [currentRevisionId, setCurrentRevisionId] = useState(revisionId)
  const [publishedRevisionIdState, setPublishedRevisionIdState] = useState(publishedRevisionId ?? null)
  const [revisionSummaries, setRevisionSummaries] = useState(revisions)
  const [revisionsDialogOpen, setRevisionsDialogOpen] = useState(false)
  const [revisionDiff, setRevisionDiff] = useState<{ version: number; selected: string; current: string } | null>(null)
  const [revisionDiffLoading, setRevisionDiffLoading] = useState(false)
  const reactFlow = useReactFlow()
  const flowIdRef = useRef(initialFlow.id)
  const failureTrackerRef = useRef<FailureTracker>({ consecutiveFailures: 0 })

  useEffect(() => {
    registerDefaultNodes()
  }, [])

  useEffect(() => {
    setRevisionSummaries(revisions)
    const latestPublished = revisions.find((rev) => rev.published)
    if (latestPublished) {
      setPublishedRevisionIdState(latestPublished.id)
    }
  }, [revisions])

  useEffect(() => {
    setPublishedRevisionIdState(publishedRevisionId ?? null)
  }, [publishedRevisionId])

  const refreshSecrets = useCallback(async () => {
    try {
      const response = await fetch("/workflows/v2/api/secrets")
      if (!response.ok) return
      const payload = await response.json()
      setSecrets(payload.secrets ?? [])
    } catch (error) {
      console.error(error)
    }
  }, [])

  const refreshSchedules = useCallback(async () => {
    try {
      const response = await fetch(`/workflows/v2/api/schedules?flowId=${flowIdRef.current}`)
      if (!response.ok) return
      const payload = await response.json()
      setSchedules(payload.schedules ?? [])
    } catch (error) {
      console.error(error)
    }
  }, [])

  const refreshRevisions = useCallback(async () => {
    try {
      const response = await fetch(`/workflows/v2/api/flows/${flowIdRef.current}/revisions`)
      if (!response.ok) return
      const payload = await response.json()
      const revisionsList: FlowRevisionSummary[] = payload.revisions ?? []
      setRevisionSummaries(revisionsList)
      const latestPublished = revisionsList.find((rev) => rev.published)
      setPublishedRevisionIdState(latestPublished ? latestPublished.id : null)
    } catch (error) {
      console.error(error)
    }
  }, [])

  useEffect(() => {
    refreshSecrets().catch(console.error)
  }, [refreshSecrets])

  useEffect(() => {
    if (scheduleDialogOpen) {
      refreshSchedules().catch(console.error)
    }
  }, [scheduleDialogOpen, refreshSchedules])

  useEffect(() => {
    let active = true
    const fetchEstimate = async () => {
      try {
        const response = await fetch(`/workflows/v2/api/flows/${flowIdRef.current}/estimate`)
        if (!response.ok || !active) return
        const payload = await response.json()
        setCostEstimate(payload)
      } catch (error) {
        console.error(error)
      }
    }
    fetchEstimate()
    const interval = setInterval(fetchEstimate, 30_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [flowState.version])

  const pushHistory = useCallback((nextFlow: Flow) => {
    setHistory((prev) => [...prev, flowState])
    setFuture([])
    setFlowState(nextFlow)
  }, [flowState])

  useEffect(() => {
    const mappedNodes = toReactFlowNodes(flowState)
    setNodes(mappedNodes)
    setEdges(toReactFlowEdges(flowState))
  }, [flowState, setEdges, setNodes])

  const handleConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, id: `${connection.source}-${connection.target}` }, eds))
    setFlowState((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      const edgeId = `${connection.source}-${connection.target}`
      if (!next.edges.find((edge) => edge.id === edgeId)) {
        next.edges.push({
          id: edgeId,
          from: { nodeId: connection.source ?? "" },
          to: { nodeId: connection.target ?? "" },
          mappings: [],
        })
      }
      return next
    })
  }, [])

  const handleSave = useCallback(async () => {
    const current = toFlow(reactFlow.getNodes(), reactFlow.getEdges(), flowState)
    const body = { flow: { ...current, version: current.version + 1 } }

    setIsSaving(true)
    try {
      const response = await fetch(`/workflows/v2/api/flows/${flowIdRef.current}/apply-edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`)
      }
      const payload = await response.json()
      const updatedFlow = FlowSchema.parse(payload.flow)
      setFlowState(updatedFlow)
      if (payload.revisionId) {
        setCurrentRevisionId(payload.revisionId)
      }
      await refreshRevisions()
    } finally {
      setIsSaving(false)
    }
  }, [flowState, reactFlow, refreshRevisions])

  const handleDelete = useCallback(() => {
    if (!selectedNodeId) return
    setNodes((nds) => nds.filter((node) => node.id !== selectedNodeId))
    setEdges((eds) => eds.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId))
    setFlowState((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      next.nodes = next.nodes.filter((node) => node.id !== selectedNodeId)
      next.edges = next.edges.filter((edge) => edge.from.nodeId !== selectedNodeId && edge.to.nodeId !== selectedNodeId)
      return next
    })
    setSelectedNodeId(null)
  }, [selectedNodeId, setEdges, setNodes])

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (!prev.length) return prev
      const nextHistory = [...prev]
      const previous = nextHistory.pop()!
      setFuture((futureStack) => [flowState, ...futureStack])
      setFlowState(previous)
      return nextHistory
    })
  }, [flowState])

  useKeyboardShortcuts(handleSave, handleDelete, handleUndo)

  const handleAddNode = useCallback((type: string) => {
    const id = `${type}-${uuidv4()}`
    const definition = NODES[type]
    const label = definition?.title ?? type
    const config = definition?.configSchema ? definition.configSchema.parse({}) : {}

    setNodes((nds) => {
      const position = {
        x: DEFAULT_POSITION.x + nds.length * 220,
        y: DEFAULT_POSITION.y + (nds.length % 2) * 160,
      }
      setFlowState((prev) => {
        const next = JSON.parse(JSON.stringify(prev))
        next.nodes.push({
          id,
          type,
          label,
          config,
          inPorts: [],
          outPorts: [],
          io: { inputSchema: undefined, outputSchema: undefined },
          policy: { timeoutMs: 60000, retries: 0 },
          costHint: definition?.costHint ?? 0,
          metadata: { position, agentHighlights: [] },
        })
        return next
      })
      return [
        ...nds,
        {
          id,
          data: { label, type, config, agentHighlights: [] },
          position,
        },
      ]
    })
  }, [])

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes)
    setFlowState((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      changes.forEach((change) => {
        if (change.type === "position" && change.position) {
          const target = next.nodes.find((node) => node.id === change.id)
          if (target) {
            const metadata = (target.metadata ?? {}) as any
            metadata.position = change.position
            target.metadata = metadata
          }
        }
      })
      return next
    })
  }, [onNodesChange])

  const handleNodeDoubleClick = useCallback((_, node: ReactFlowNode) => {
    setSelectedNodeId(node.id)
  }, [])

  const handleSelectionChange = useCallback((params: { nodes?: ReactFlowNode[] }) => {
    if (!params.nodes || params.nodes.length === 0) {
      setSelectedNodeId(null)
    }
  }, [])

  const selectedFlowNode = useMemo(() => flowState.nodes.find((node) => node.id === selectedNodeId) ?? null, [flowState.nodes, selectedNodeId])

  useEffect(() => {
    if (!selectedNodeId || !latestRun?.id) {
      setActiveSnapshot(null)
      setLineage([])
      return
    }

    const fetchSnapshot = async () => {
      const response = await fetch(`/workflows/v2/api/runs/${latestRun.id}/nodes/${selectedNodeId}`)
      if (!response.ok) return
      const payload = await response.json()
      setActiveSnapshot(payload.snapshot ?? null)
      setLineage(payload.lineage ?? [])
    }

    fetchSnapshot().catch(console.error)
  }, [selectedNodeId, latestRun?.id])

  const loadRunDetails = useCallback(async (runId: string) => {
    try {
      const status = await fetch(`/workflows/v2/api/runs/${runId}`)
      if (!status.ok) {
        return null
      }
      const payload = await status.json()
      const runPayload = payload.run ?? {}
      const runDetails: RunDetails = {
        id: runId,
        status: runPayload.status ?? "unknown",
        nodes: runPayload.nodes ?? [],
        logs: runPayload.logs ?? [],
        summary: runPayload.summary ?? {
          totalDurationMs: 0,
          totalCost: 0,
          successCount: 0,
          errorCount: 0,
          pendingCount: 0,
          startedAt: runPayload.startedAt ?? null,
          finishedAt: runPayload.finishedAt ?? null,
        },
      }
      setLatestRun(runDetails)
      const { next, shouldAlert } = recordRunFailure(failureTrackerRef.current, runDetails.status)
      failureTrackerRef.current = next
      if (shouldAlert) {
        toast({
          title: "Repeated run failures",
          description: "The last few runs failed. Review node logs for details.",
          variant: "destructive",
        })
      }
      return runDetails
    } catch (error) {
      console.error(error)
      return null
    }
  }, [toast])

  const runFlow = useCallback(async () => {
    const response = await fetch(`/workflows/v2/api/flows/${flowIdRef.current}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: {}, revisionId: currentRevisionId }),
    })
    if (!response.ok) return
    const { runId } = await response.json()
    await loadRunDetails(runId)
  }, [currentRevisionId, loadRunDetails])

  const runFromHere = useCallback(async () => {
    if (!latestRun?.id || !selectedNodeId) return
    const response = await fetch(`/workflows/v2/api/runs/${latestRun.id}/nodes/${selectedNodeId}/run-from-here`, {
      method: "POST",
    })
    if (!response.ok) return
    const { runId } = await response.json()
    await loadRunDetails(runId)
  }, [latestRun?.id, selectedNodeId, loadRunDetails])

  const handlePublish = useCallback(async () => {
    try {
      const response = await fetch(`/workflows/v2/api/flows/${flowIdRef.current}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: currentRevisionId }),
      })
      if (!response.ok) {
        throw new Error(`Publish failed: ${response.status}`)
      }
      setPublishedRevisionIdState(currentRevisionId)
      await refreshRevisions()
    } catch (error) {
      console.error(error)
    }
  }, [currentRevisionId, refreshRevisions])

  const loadRevisionDiff = useCallback(async (revisionId: string) => {
    setRevisionDiffLoading(true)
    try {
      const response = await fetch(`/workflows/v2/api/flows/${flowIdRef.current}/revisions/${revisionId}`)
      if (!response.ok) return
      const payload = await response.json()
      setRevisionDiff({
        version: payload.revision.version,
        selected: JSON.stringify(payload.revision.graph, null, 2),
        current: JSON.stringify(flowState, null, 2),
      })
    } catch (error) {
      console.error(error)
    } finally {
      setRevisionDiffLoading(false)
    }
  }, [flowState])

  useEffect(() => {
    if (revisionsDialogOpen) {
      refreshRevisions().catch(console.error)
    }
  }, [revisionsDialogOpen, refreshRevisions])

  useEffect(() => {
    if (!revisionsDialogOpen) {
      setRevisionDiff(null)
    }
  }, [revisionsDialogOpen])

  const handleAgentSubmit = useCallback(async () => {
    if (!agentPrompt.trim()) return
    const current = toFlow(reactFlow.getNodes(), reactFlow.getEdges(), flowState)
    const response = await fetch(`/workflows/v2/api/flows/${flowIdRef.current}/edits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: agentPrompt, flow: current }),
    })
    if (!response.ok) return
    const payload = await response.json()
    const prereqs = payload.prerequisites ?? []
    setAgentResult({
      edits: payload.edits ?? [],
      prerequisites: prereqs,
      rationale: payload.rationale ?? "",
    })
    setPrerequisites(prereqs)
    setAgentDialogOpen(true)
  }, [agentPrompt, flowState, reactFlow])

  const confirmAgentEdits = useCallback(async () => {
    if (!agentResult) return
    const current = toFlow(reactFlow.getNodes(), reactFlow.getEdges(), flowState)
    const applied = applyEditsLocally(current, agentResult.edits)

    setAgentDialogOpen(false)
    setAgentPrompt("")
    pushHistory(applied)

    const response = await fetch(`/workflows/v2/api/flows/${flowIdRef.current}/apply-edits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flow: { ...applied, version: applied.version + 1 } }),
    })
    if (response.ok) {
      const payload = await response.json()
      const nextFlow = FlowSchema.parse(payload.flow)
      setFlowState(nextFlow)
      if (payload.revisionId) {
        setCurrentRevisionId(payload.revisionId)
      }
      await refreshRevisions()
    }
  }, [agentResult, flowState, pushHistory, reactFlow, refreshRevisions])

  const inspectorNode = selectedFlowNode
  const inspectorSnapshot = inspectorNode && latestRun?.nodes.find((node) => node.node_id === inspectorNode.id)
  const inspectorLogs = useMemo(
    () => (inspectorNode && latestRun ? latestRun.logs.filter((log) => log.node_id === inspectorNode.id) : []),
    [inspectorNode?.id, latestRun]
  )
  const runSummary = latestRun?.summary

  const fetchPrerequisites = useCallback(async () => {
    try {
      const response = await fetch(`/workflows/v2/api/flows/${flowIdRef.current}/prereqs`)
      if (!response.ok) return
      const payload = await response.json()
      setPrerequisites(payload.prerequisites ?? [])
    } catch (error) {
      console.error(error)
    }
  }, [])

  const handleCreateSecret = useCallback(async () => {
    try {
      const response = await fetch("/workflows/v2/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSecretName.trim(), value: newSecretValue }),
      })
      if (!response.ok) {
        throw new Error(`Failed to create secret (${response.status})`)
      }
      await refreshSecrets()
      await fetchPrerequisites()
      setSecretDialogOpen(false)
      setNewSecretName("")
      setNewSecretValue("")
    } catch (error) {
      console.error(error)
    }
  }, [newSecretName, newSecretValue, refreshSecrets, fetchPrerequisites])

  const unmetPrereqs = agentResult?.prerequisites ?? []

  useEffect(() => {
    fetchPrerequisites().catch(console.error)
  }, [fetchPrerequisites, flowState.version])

  useEffect(() => {
    setTemplateName(`${flowState.name} Template`)
  }, [flowState.name])

  const handleSaveTemplate = useCallback(async () => {
    try {
      const response = await fetch(`/workflows/v2/api/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId: flowState.id,
          name: templateName.trim(),
          description: templateDescription.trim() || undefined,
          tags: templateTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      })
      if (!response.ok) {
        throw new Error(`Failed to save template (${response.status})`)
      }
      setTemplateDialogOpen(false)
      setTemplateDescription("")
      setTemplateTags("")
    } catch (error) {
      console.error(error)
    }
  }, [flowState.id, templateDescription, templateName, templateTags])

  const estimatedCostLabel = costEstimate ? costEstimate.estimatedCost.toFixed(4) : "…"
  const isPublished = currentRevisionId === publishedRevisionIdState
  const currentRevisionSummary = useMemo(
    () => revisionSummaries.find((rev) => rev.id === currentRevisionId),
    [revisionSummaries, currentRevisionId]
  )

  const handleCreateSchedule = useCallback(async () => {
    try {
      const response = await fetch(`/workflows/v2/api/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId: flowIdRef.current,
          cronExpression: newScheduleCron.trim(),
          timezone: newScheduleTimezone,
          enabled: newScheduleEnabled,
        }),
      })
      if (!response.ok) {
        throw new Error(`Failed to create schedule (${response.status})`)
      }
      await refreshSchedules()
      setNewScheduleCron("0 * * * *")
      setNewScheduleTimezone("UTC")
      setNewScheduleEnabled(true)
    } catch (error) {
      console.error(error)
    }
  }, [newScheduleCron, newScheduleTimezone, newScheduleEnabled, refreshSchedules])

  const handleRunScheduleTick = useCallback(async () => {
    try {
      await fetch(`/workflows/v2/api/schedules/tick`, { method: "POST" })
      await refreshSchedules()
    } catch (error) {
      console.error(error)
    }
  }, [refreshSchedules])

  return (
    <div className="flex h-screen" data-testid="flow-v2-builder">
      <aside className="w-64 border-r bg-muted/40">
        <NodePalette onAdd={handleAddNode} />
        <Separator />
        <div className="space-y-3 p-4">
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={runFlow}
            className="w-full"
            disabled={prerequisites.length > 0}
          >
            {prerequisites.length > 0 ? "Resolve prerequisites" : "Run Flow"}
          </Button>
          <Button
            variant="outline"
            onClick={runFromHere}
            disabled={!selectedNodeId || !latestRun}
            className="w-full"
          >
            Run from here
          </Button>
        </div>
      </aside>
      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b bg-background/80 p-4">
          <div>
            <h2 className="text-xl font-semibold">{flowState.name}</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={isPublished ? "secondary" : "outline"}>{isPublished ? "Published" : "Draft"}</Badge>
              {currentRevisionSummary && <span>Revision v{currentRevisionSummary.version}</span>}
              <span>Est. cost: {estimatedCostLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRevisionDiff(null)
                setRevisionsDialogOpen(true)
              }}
            >
              Revisions
            </Button>
            <Button onClick={handlePublish} disabled={isPublished}>Publish</Button>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(true)}>Schedules</Button>
            <Link href="/workflows/v2/templates">
              <Button variant="outline">Templates</Button>
            </Link>
            <Button onClick={() => setTemplateDialogOpen(true)}>Save as template</Button>
          </div>
        </div>
        <div className="flex-1">
          {prerequisites.length > 0 && (
            <div className="border-b border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-medium">Prerequisites required before running:</div>
              <ul className="list-disc pl-5">
                {prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {latestRun && runSummary && (
            <div className="border-b bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
              <div className="flex flex-wrap gap-4">
                <span><span className="font-medium text-foreground">Last run:</span> {formatTimestamp(runSummary.finishedAt ?? runSummary.startedAt)} ({latestRun.status})</span>
                <span><span className="font-medium text-foreground">Duration:</span> {formatDurationMs(runSummary.totalDurationMs)}</span>
                <span><span className="font-medium text-foreground">Cost:</span> {formatCost(runSummary.totalCost)}</span>
                <span><span className="font-medium text-foreground">Success nodes:</span> {runSummary.successCount}</span>
                <span><span className="font-medium text-foreground">Errors:</span> {runSummary.errorCount}</span>
              </div>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            fitView
            onNodeDoubleClick={handleNodeDoubleClick}
            onSelectionChange={handleSelectionChange}
            panOnDrag
            snapToGrid
          >
            <MiniMap />
            <Controls />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          </ReactFlow>
        </div>
        <div className="border-t p-3">
          <form
            className="flex items-center gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              handleAgentSubmit()
            }}
          >
            <Input
              value={agentPrompt}
              onChange={(event) => setAgentPrompt(event.target.value)}
              placeholder="Ask the Agent… e.g. Create HTTP → AI(JSON) → Slack summary"
            />
            <Button type="submit">Ask</Button>
          </form>
        </div>
      </main>
      <aside className="w-[360px] border-l bg-background">
        <NodeInspector
          node={inspectorNode}
          runDetails={inspectorSnapshot ?? null}
          lineage={lineage}
          logs={inspectorLogs}
          secrets={secrets}
          onRequestNewSecret={(_field) => setSecretDialogOpen(true)}
          onConfigChange={(config) => {
            setFlowState((current) => {
              const next = JSON.parse(JSON.stringify(current))
              const target = next.nodes.find((node) => node.id === inspectorNode?.id)
              if (target) {
                target.config = config
              }
              return next
            })
            setNodes((prev) => prev.map((node) => (node.id === inspectorNode?.id ? { ...node, data: { ...node.data, config } } : node)))
          }}
        />
      </aside>

      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Proposed Agent edits</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] space-y-3">
            <pre className="rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(agentResult, null, 2)}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmAgentEdits}>Apply edits</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Secret</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Secret name"
              value={newSecretName}
              onChange={(event) => setNewSecretName(event.target.value)}
            />
            <Textarea
              placeholder="Secret value"
              value={newSecretValue}
              onChange={(event) => setNewSecretValue(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecretDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSecret} disabled={!newSecretName.trim() || !newSecretValue}>Save Secret</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Template name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
            <Textarea
              placeholder="Description"
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
            />
            <Input
              placeholder="Tags (comma separated)"
              value={templateTags}
              onChange={(event) => setTemplateTags(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={!templateName.trim()}>Save template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revisionsDialogOpen} onOpenChange={setRevisionsDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Revisions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {revisionSummaries.map((rev) => (
              <div key={rev.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">Version v{rev.version}</div>
                  <div className="text-xs text-muted-foreground">{new Date(rev.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  {rev.published && <Badge variant="secondary">Published</Badge>}
                  <Button size="sm" variant="outline" onClick={() => loadRevisionDiff(rev.id)}>Diff</Button>
                </div>
              </div>
            ))}
            {revisionSummaries.length === 0 && (
              <p className="text-sm text-muted-foreground">No revisions yet.</p>
            )}
          </div>
          {revisionDiffLoading && <p className="text-sm text-muted-foreground">Loading diff…</p>}
          {revisionDiff && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium">Revision v{revisionDiff.version}</h3>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{revisionDiff.selected}</pre>
              </div>
              <div>
                <h3 className="text-sm font-medium">Current draft</h3>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{revisionDiff.current}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Schedules</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Cron expression"
                value={newScheduleCron}
                onChange={(event) => setNewScheduleCron(event.target.value)}
              />
              <Input
                placeholder="Timezone"
                value={newScheduleTimezone}
                onChange={(event) => setNewScheduleTimezone(event.target.value)}
              />
              <Button variant="outline" onClick={() => setNewScheduleEnabled((prev) => !prev)}>
                {newScheduleEnabled ? "Enabled" : "Disabled"}
              </Button>
              <Button onClick={handleCreateSchedule}>Add</Button>
            </div>
            <div className="space-y-2">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">{schedule.cron_expression} ({schedule.timezone})</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Next: {schedule.next_run_at ?? "—"}</span>
                    <span>Last: {schedule.last_run_at ?? "—"}</span>
                    <span>{schedule.enabled ? "Enabled" : "Disabled"}</span>
                  </div>
                </div>
              ))}
              {schedules.length === 0 && (
                <p className="text-sm text-muted-foreground">No schedules yet.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleRunScheduleTick}>Run pending schedules</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function FlowBuilderClient(props: FlowBuilderClientProps) {
  return (
    <ReactFlowProvider>
      <FlowBuilderSurface {...props} />
    </ReactFlowProvider>
  )
}
