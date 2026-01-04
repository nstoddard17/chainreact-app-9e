import { randomUUID } from "crypto"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"

import { FlowSchema, type Flow, type Edge, type Node, type JsonValue, JsonValueSchema } from "./schema"

// Alias for clarity
type FlowEdge = Edge

/**
 * Deduplicates edges in a flow by keeping only the first edge for each source->target pair.
 * This prevents duplicate edges from accumulating in the database.
 */
function deduplicateFlowEdges(flow: Flow): Flow {
  const seenEdges = new Set<string>()
  const deduplicatedEdges: FlowEdge[] = []

  for (const edge of flow.edges) {
    const key = `${edge.from.nodeId}->${edge.to.nodeId}`
    if (seenEdges.has(key)) {
      console.warn(`[FlowRepository] Removing duplicate edge before save: ${key} (id: ${edge.id})`)
      continue
    }
    seenEdges.add(key)
    deduplicatedEdges.push(edge)
  }

  if (deduplicatedEdges.length !== flow.edges.length) {
    console.log(`[FlowRepository] Deduplicated ${flow.edges.length - deduplicatedEdges.length} duplicate edges`)
  }

  return {
    ...flow,
    edges: deduplicatedEdges,
  }
}

export interface FlowDefinitionRecord {
  id: string
  name: string
  createdAt: string
}

export interface FlowRevisionRecord {
  id: string
  flowId: string
  version: number
  graph: Flow
  createdAt: string
  published?: boolean
  publishedAt?: string | null
}

export interface FlowRevisionSummary {
  id: string
  version: number
  createdAt: string
  published: boolean
  publishedAt?: string | null
}

const WORKFLOWS_TABLE = "workflows"
const WORKFLOWS_REVISIONS_TABLE = "workflows_revisions"
const WORKFLOW_NODES_TABLE = "workflow_nodes"
const WORKFLOW_EDGES_TABLE = "workflow_edges"
const LEGACY_CREATE_REVISION_FUNCTIONS = ["workflows_create_revision"] as const
const MAX_REVISIONS_PER_WORKFLOW = 5

const IsoDateString = z.union([z.string(), z.date()]).transform((value) => {
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value")
  }
  return date.toISOString()
})

const FlowDefinitionRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: IsoDateString,
})

const FlowRevisionRowSchema = z.object({
  id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  version: z.number().int().min(0),
  graph: JsonValueSchema,
  created_at: IsoDateString,
  published: z.boolean().optional(),
  published_at: z.union([z.string(), z.null()]).transform((value) => {
    if (value === null) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new Error("Invalid published_at date value")
    }
    return date.toISOString()
  }).optional(),
})

export type FlowRepositoryClient = SupabaseClient<any>

export interface CreateFlowDefinitionParams {
  id?: string
  name: string
}

export interface CreateFlowRevisionParams {
  id?: string
  flowId: string
  flow: Flow
  version?: number
}

export interface LoadFlowRevisionParams {
  flowId: string
  version?: number
}

export class FlowRepository {
  private readonly client: FlowRepositoryClient
  private readonly fallbackClient?: FlowRepositoryClient

  constructor(client: FlowRepositoryClient, fallbackClient?: FlowRepositoryClient) {
    this.client = client
    this.fallbackClient = fallbackClient
  }

  static create(client: FlowRepositoryClient, fallbackClient?: FlowRepositoryClient) {
    return new FlowRepository(client, fallbackClient)
  }

  private shouldUseFallback(error: { message?: string } | null) {
    if (!error?.message) return false
    const message = error.message.toLowerCase()
    return (
      message.includes("infinite recursion detected") ||
      message.includes('relation "flow_v2')
    )
  }

  private async withFallback<T>(
    executor: (client: FlowRepositoryClient) => Promise<{ data: T; error: any }>
  ): Promise<{ data: T; error: any }> {
    const primary = await executor(this.client)
    if (!primary?.error || !this.fallbackClient || this.fallbackClient === this.client || !this.shouldUseFallback(primary.error)) {
      return primary
    }
    console.warn("[FlowRepository] Retrying query with privileged client due to policy recursion")
    return executor(this.fallbackClient)
  }

  async createDefinition({ id = randomUUID(), name }: CreateFlowDefinitionParams): Promise<FlowDefinitionRecord> {
    const now = new Date().toISOString()

    const { data, error } = await this.withFallback((client) =>
      client
        .from(WORKFLOWS_TABLE)
        .insert({ id, name, created_at: now })
        .select("id, name, created_at")
        .single()
    )

    if (error) {
      throw new Error(`Failed to create flow definition: ${error.message}`)
    }

    const parsed = FlowDefinitionRowSchema.parse(data)

    return {
      id: parsed.id,
      name: parsed.name,
      createdAt: parsed.created_at,
    }
  }

  async listDefinitions(): Promise<FlowDefinitionRecord[]> {
    const { data, error } = await this.withFallback((client) =>
      client
        .from(WORKFLOWS_TABLE)
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
    )

    if (error) {
      throw new Error(`Failed to list flow definitions: ${error.message}`)
    }

    return (data ?? []).map((row) => {
      const parsed = FlowDefinitionRowSchema.parse(row)
      return {
        id: parsed.id,
        name: parsed.name,
        createdAt: parsed.created_at,
      }
    })
  }

  async createRevision({
    id = randomUUID(),
    flowId,
    flow,
    version,
  }: CreateFlowRevisionParams): Promise<FlowRevisionRecord> {
    // Deduplicate edges before saving to prevent duplicates from accumulating
    const deduplicatedFlow = deduplicateFlowEdges(flow)
    const validated = FlowSchema.parse(deduplicatedFlow)

    // Log size for debugging
    const jsonSize = JSON.stringify(validated).length
    console.log(`[FlowRepository] Creating revision for flow ${flowId}, JSON size: ${jsonSize} bytes (${(jsonSize / 1024).toFixed(2)} KB)`)

    // If version is explicitly provided, use the old insert method
    if (typeof version === "number") {
      const now = new Date().toISOString()

      const { data, error } = await this.withFallback((client) =>
        client
          .from(WORKFLOWS_REVISIONS_TABLE)
          .insert({
            id,
            workflow_id: flowId,
            version,
            graph: validated,
            created_at: now,
          })
          .select("id, workflow_id, version, graph, created_at")
          .single()
      )

      if (error) {
        console.error(`[FlowRepository] Insert error for flow ${flowId}:`, error)
        throw new Error(`Failed to create flow revision: ${error.message}`)
      }

      const parsed = FlowRevisionRowSchema.parse(data)
      return {
        id: parsed.id,
        flowId: parsed.workflow_id,
        version: parsed.version,
        graph: FlowSchema.parse(parsed.graph as JsonValue),
        createdAt: parsed.created_at,
      }
    }

    // Use atomic create function that does version increment + insert in one transaction
    const now = new Date().toISOString()

    let rpcData: any = null
    let rpcError: any = null

    for (const functionName of LEGACY_CREATE_REVISION_FUNCTIONS) {
      const { data, error } = await this.client
        .rpc(functionName, {
          p_id: id,
          p_flow_id: flowId,
          p_graph: validated,
          p_created_at: now,
        })
        .single()

      if (!error) {
        rpcData = data
        rpcError = null
        break
      }

      rpcError = error
      const message = error?.message?.toLowerCase() ?? ""
      if (error?.code === "42883" || message.includes("does not exist")) {
        continue
      }

      break
    }

    if (!rpcData) {
      // Fallback: If RPC function doesn't exist, manually get next version
      if (rpcError) {
        console.warn('[FlowRepository] RPC function failed, using fallback:', rpcError.message)
      } else {
        console.warn('[FlowRepository] RPC function unavailable, using fallback insert.')
      }

      // Get the current max version
      const { data: maxVersionData, error: maxVersionError } = await this.withFallback((client) =>
        client
          .from(WORKFLOWS_REVISIONS_TABLE)
          .select("version")
          .eq("workflow_id", flowId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle()
      )

      if (maxVersionError) {
        throw new Error(`Failed to get max version: ${maxVersionError.message}`)
      }

      const nextVersion = (maxVersionData?.version ?? -1) + 1

      // Insert with the calculated version
      const { data: insertData, error: insertError } = await this.withFallback((client) =>
        client
          .from(WORKFLOWS_REVISIONS_TABLE)
          .insert({
            id,
            workflow_id: flowId,
            version: nextVersion,
            graph: validated,
            created_at: now,
          })
          .select("id, workflow_id, version, graph, created_at")
          .single()
      )

      if (insertError) {
        throw new Error(`Failed to create flow revision (fallback): ${insertError.message}`)
      }

      const parsed = FlowRevisionRowSchema.parse(insertData)
      return {
        id: parsed.id,
        flowId: parsed.workflow_id,
        version: parsed.version,
        graph: FlowSchema.parse(parsed.graph as JsonValue),
        createdAt: parsed.created_at,
      }
    }

    const parsed = FlowRevisionRowSchema.parse(rpcData)
    return {
      id: parsed.id,
      flowId: parsed.workflow_id,
      version: parsed.version,
      graph: FlowSchema.parse(parsed.graph as JsonValue),
      createdAt: parsed.created_at,
    }
  }

  async loadRevision({ flowId, version }: LoadFlowRevisionParams): Promise<FlowRevisionRecord | null> {
    // If loading a specific version, load from revision history (JSON snapshot)
    if (typeof version === "number") {
      const { data, error } = await this.withFallback((client) =>
        client
          .from(WORKFLOWS_REVISIONS_TABLE)
          .select("id, workflow_id, version, graph, created_at, published, published_at")
          .eq("workflow_id", flowId)
          .eq("version", version)
          .maybeSingle()
      )

      if (error) {
        throw new Error(`Failed to load flow revision: ${error.message}`)
      }

      if (!data) {
        return null
      }

      const parsed = FlowRevisionRowSchema.parse(data)

      return {
        id: parsed.id,
        flowId: parsed.workflow_id,
        version: parsed.version,
        graph: FlowSchema.parse(parsed.graph as JsonValue),
        createdAt: parsed.created_at,
        published: parsed.published ?? false,
        publishedAt: parsed.published_at ?? null,
      }
    }

    // For latest version, try to load from normalized tables first
    const currentFlow = await this.loadCurrentFlow(flowId)

    if (currentFlow && currentFlow.nodes.length > 0) {
      // We have data in normalized tables - use it
      // Get the latest revision metadata for the record
      const { data: latestRevision } = await this.withFallback((client) =>
        client
          .from(WORKFLOWS_REVISIONS_TABLE)
          .select("id, version, created_at, published, published_at")
          .eq("workflow_id", flowId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle()
      )

      return {
        id: latestRevision?.id ?? flowId,
        flowId,
        version: latestRevision?.version ?? currentFlow.version,
        graph: currentFlow,
        createdAt: latestRevision?.created_at ?? new Date().toISOString(),
        published: latestRevision?.published ?? false,
        publishedAt: latestRevision?.published_at ?? null,
      }
    }

    // Fallback: Load from revision history (for workflows that haven't been migrated yet)
    const { data, error } = await this.withFallback((client) =>
      client
        .from(WORKFLOWS_REVISIONS_TABLE)
        .select("id, workflow_id, version, graph, created_at, published, published_at")
        .eq("workflow_id", flowId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
    )

    if (error) {
      throw new Error(`Failed to load flow revision: ${error.message}`)
    }

    if (!data) {
      return null
    }

    const parsed = FlowRevisionRowSchema.parse(data)

    return {
      id: parsed.id,
      flowId: parsed.workflow_id,
      version: parsed.version,
      graph: FlowSchema.parse(parsed.graph as JsonValue),
      createdAt: parsed.created_at,
      published: parsed.published ?? false,
      publishedAt: parsed.published_at ?? null,
    }
  }

  async loadRevisionById(id: string): Promise<FlowRevisionRecord | null> {
    const { data, error } = await this.withFallback((client) =>
      client
        .from(WORKFLOWS_REVISIONS_TABLE)
        .select("id, workflow_id, version, graph, created_at, published, published_at")
        .eq("id", id)
        .maybeSingle()
    )

    if (error) {
      throw new Error(`Failed to load flow revision by id: ${error.message}`)
    }

    if (!data) {
      return null
    }

    const parsed = FlowRevisionRowSchema.parse(data)

    return {
      id: parsed.id,
      flowId: parsed.workflow_id,
      version: parsed.version,
      graph: FlowSchema.parse(parsed.graph as JsonValue),
      createdAt: parsed.created_at,
      published: parsed.published ?? false,
      publishedAt: parsed.published_at ?? null,
    }
  }

  async listRevisions(flowId: string): Promise<FlowRevisionSummary[]> {
    const summarySchema = z.object({
      id: z.string().uuid(),
      version: z.number().int(),
      created_at: IsoDateString,
      published: z.boolean().optional(),
      published_at: z.union([IsoDateString, z.null()]).optional(),
    })

    const { data, error } = await this.withFallback((client) =>
      client
        .from(WORKFLOWS_REVISIONS_TABLE)
        .select("id, version, created_at, published, published_at")
        .eq("workflow_id", flowId)
        .order("version", { ascending: false })
    )

    if (error) {
      throw new Error(`Failed to list revisions: ${error.message}`)
    }

    return (data ?? []).map((row) => {
      const parsed = summarySchema.parse(row)
      return {
        id: parsed.id,
        version: parsed.version,
        createdAt: parsed.created_at,
        published: parsed.published ?? false,
        publishedAt: parsed.published_at ?? null,
      }
    })
  }

  // ============================================================================
  // NORMALIZED STORAGE METHODS
  // ============================================================================

  /**
   * Save nodes to the workflow_nodes table (upsert by node.id)
   */
  async saveNodes(flowId: string, nodes: Node[], userId?: string): Promise<void> {
    const now = new Date().toISOString()

    // Convert Flow nodes to database records
    const nodeRecords = nodes.map((node, index) => ({
      id: node.id,
      workflow_id: flowId,
      user_id: userId || null,
      node_type: node.type,
      label: node.label,
      description: node.description || null,
      config: node.config,
      position_x: (node.metadata as any)?.position?.x ?? 400,
      position_y: (node.metadata as any)?.position?.y ?? (100 + index * 180),
      is_trigger: (node.metadata as any)?.isTrigger ?? false,
      provider_id: node.type.split(':')[0] || null,
      display_order: index,
      in_ports: node.inPorts,
      out_ports: node.outPorts,
      io_schema: node.io,
      policy: node.policy,
      cost_hint: node.costHint,
      metadata: node.metadata || null,
      updated_at: now,
    }))

    if (nodeRecords.length === 0) {
      // If no nodes, just delete all existing nodes for this workflow
      const { error: deleteError } = await this.withFallback((client) =>
        client
          .from(WORKFLOW_NODES_TABLE)
          .delete()
          .eq("workflow_id", flowId)
      )
      if (deleteError) {
        throw new Error(`Failed to delete nodes: ${deleteError.message}`)
      }
      return
    }

    // Get existing node IDs to determine what to delete
    const { data: existingNodes, error: fetchError } = await this.withFallback((client) =>
      client
        .from(WORKFLOW_NODES_TABLE)
        .select("id")
        .eq("workflow_id", flowId)
    )

    if (fetchError) {
      throw new Error(`Failed to fetch existing nodes: ${fetchError.message}`)
    }

    const newNodeIds = new Set(nodeRecords.map((n) => n.id))
    const nodesToDelete = (existingNodes ?? [])
      .filter((n) => !newNodeIds.has(n.id))
      .map((n) => n.id)

    // Delete removed nodes
    if (nodesToDelete.length > 0) {
      const { error: deleteError } = await this.withFallback((client) =>
        client
          .from(WORKFLOW_NODES_TABLE)
          .delete()
          .in("id", nodesToDelete)
      )
      if (deleteError) {
        throw new Error(`Failed to delete removed nodes: ${deleteError.message}`)
      }
    }

    // Upsert nodes
    const { error: upsertError } = await this.withFallback((client) =>
      client
        .from(WORKFLOW_NODES_TABLE)
        .upsert(nodeRecords, { onConflict: "id" })
    )

    if (upsertError) {
      throw new Error(`Failed to save nodes: ${upsertError.message}`)
    }

    console.log(`[FlowRepository] Saved ${nodeRecords.length} nodes for flow ${flowId}`)
  }

  /**
   * Save edges to the workflow_edges table (upsert by edge.id)
   */
  async saveEdges(flowId: string, edges: FlowEdge[], userId?: string): Promise<void> {
    const now = new Date().toISOString()

    // Deduplicate edges first
    const seenEdges = new Set<string>()
    const uniqueEdges: FlowEdge[] = []
    for (const edge of edges) {
      const key = `${edge.from.nodeId}->${edge.to.nodeId}`
      if (!seenEdges.has(key)) {
        seenEdges.add(key)
        uniqueEdges.push(edge)
      }
    }

    // Convert Flow edges to database records
    const edgeRecords = uniqueEdges.map((edge) => ({
      id: edge.id,
      workflow_id: flowId,
      user_id: userId || null,
      source_node_id: edge.from.nodeId,
      target_node_id: edge.to.nodeId,
      source_port_id: edge.from.portId || "source",
      target_port_id: edge.to.portId || "target",
      condition_expr: edge.conditionExpr || null,
      mappings: edge.mappings,
      metadata: edge.metadata || null,
      updated_at: now,
    }))

    if (edgeRecords.length === 0) {
      // If no edges, just delete all existing edges for this workflow
      const { error: deleteError } = await this.withFallback((client) =>
        client
          .from(WORKFLOW_EDGES_TABLE)
          .delete()
          .eq("workflow_id", flowId)
      )
      if (deleteError) {
        throw new Error(`Failed to delete edges: ${deleteError.message}`)
      }
      return
    }

    // Get existing edge IDs to determine what to delete
    const { data: existingEdges, error: fetchError } = await this.withFallback((client) =>
      client
        .from(WORKFLOW_EDGES_TABLE)
        .select("id")
        .eq("workflow_id", flowId)
    )

    if (fetchError) {
      throw new Error(`Failed to fetch existing edges: ${fetchError.message}`)
    }

    const newEdgeIds = new Set(edgeRecords.map((e) => e.id))
    const edgesToDelete = (existingEdges ?? [])
      .filter((e) => !newEdgeIds.has(e.id))
      .map((e) => e.id)

    // Delete removed edges
    if (edgesToDelete.length > 0) {
      const { error: deleteError } = await this.withFallback((client) =>
        client
          .from(WORKFLOW_EDGES_TABLE)
          .delete()
          .in("id", edgesToDelete)
      )
      if (deleteError) {
        throw new Error(`Failed to delete removed edges: ${deleteError.message}`)
      }
    }

    // Upsert edges
    const { error: upsertError } = await this.withFallback((client) =>
      client
        .from(WORKFLOW_EDGES_TABLE)
        .upsert(edgeRecords, { onConflict: "id" })
    )

    if (upsertError) {
      throw new Error(`Failed to save edges: ${upsertError.message}`)
    }

    console.log(`[FlowRepository] Saved ${edgeRecords.length} edges for flow ${flowId}`)
  }

  /**
   * Load nodes from the workflow_nodes table
   */
  async loadNodes(flowId: string): Promise<Node[]> {
    const { data, error } = await this.withFallback((client) =>
      client
        .from(WORKFLOW_NODES_TABLE)
        .select("*")
        .eq("workflow_id", flowId)
        .order("display_order", { ascending: true })
    )

    if (error) {
      throw new Error(`Failed to load nodes: ${error.message}`)
    }

    if (!data || data.length === 0) {
      return []
    }

    // Convert database records to Flow nodes
    return data.map((row) => ({
      id: row.id,
      type: row.node_type,
      label: row.label || row.node_type,
      description: row.description || undefined,
      config: (row.config as Record<string, JsonValue>) || {},
      inPorts: (row.in_ports as any[]) || [],
      outPorts: (row.out_ports as any[]) || [],
      io: (row.io_schema as any) || { inputSchema: undefined, outputSchema: undefined },
      policy: (row.policy as any) || { timeoutMs: 60000, retries: 0 },
      costHint: row.cost_hint || 0,
      metadata: {
        ...(row.metadata as Record<string, JsonValue> || {}),
        position: { x: row.position_x, y: row.position_y },
        isTrigger: row.is_trigger || false,
      },
    }))
  }

  /**
   * Load edges from the workflow_edges table
   */
  async loadEdges(flowId: string): Promise<FlowEdge[]> {
    const { data, error } = await this.withFallback((client) =>
      client
        .from(WORKFLOW_EDGES_TABLE)
        .select("*")
        .eq("workflow_id", flowId)
    )

    if (error) {
      throw new Error(`Failed to load edges: ${error.message}`)
    }

    if (!data || data.length === 0) {
      return []
    }

    // Convert database records to Flow edges
    return data.map((row) => ({
      id: row.id,
      from: {
        nodeId: row.source_node_id,
        portId: row.source_port_id || undefined,
      },
      to: {
        nodeId: row.target_node_id,
        portId: row.target_port_id || undefined,
      },
      conditionExpr: row.condition_expr || undefined,
      mappings: (row.mappings as any[]) || [],
      metadata: (row.metadata as Record<string, JsonValue>) || undefined,
    }))
  }

  /**
   * Load current flow state from normalized tables (workflow_nodes + workflow_edges)
   */
  async loadCurrentFlow(flowId: string): Promise<Flow | null> {
    // Load workflow metadata
    const { data: workflowData, error: workflowError } = await this.withFallback((client) =>
      client
        .from(WORKFLOWS_TABLE)
        .select("id, name, description")
        .eq("id", flowId)
        .maybeSingle()
    )

    if (workflowError) {
      throw new Error(`Failed to load workflow: ${workflowError.message}`)
    }

    if (!workflowData) {
      return null
    }

    // Load nodes and edges in parallel
    const [nodes, edges] = await Promise.all([
      this.loadNodes(flowId),
      this.loadEdges(flowId),
    ])

    // Get the latest version number from revisions
    const { data: latestRevision } = await this.withFallback((client) =>
      client
        .from(WORKFLOWS_REVISIONS_TABLE)
        .select("version")
        .eq("workflow_id", flowId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
    )

    const flow: Flow = {
      id: workflowData.id,
      name: workflowData.name || "Untitled Workflow",
      version: latestRevision?.version ?? 0,
      description: workflowData.description || undefined,
      nodes,
      edges,
    }

    return FlowSchema.parse(flow)
  }

  /**
   * Atomic save: nodes + edges + revision snapshot (called on every autosave)
   * This is the main entry point for saving workflow changes.
   * @param flowId - The workflow ID
   * @param flow - The flow data to save
   * @param userId - The user ID to associate with nodes and edges (for RLS)
   */
  async saveGraph(flowId: string, flow: Flow, userId?: string): Promise<FlowRevisionRecord> {
    // Validate and deduplicate the flow
    const deduplicatedFlow = deduplicateFlowEdges(flow)
    const validated = FlowSchema.parse(deduplicatedFlow)

    console.log(`[FlowRepository] saveGraph for flow ${flowId}: ${validated.nodes.length} nodes, ${validated.edges.length} edges`)

    // Save to normalized tables
    await this.saveNodes(flowId, validated.nodes, userId)
    await this.saveEdges(flowId, validated.edges, userId)

    // Create revision snapshot for history
    const revision = await this.createRevision({
      flowId,
      flow: validated,
    })

    // Cleanup old revisions (keep only latest N)
    await this.cleanupOldRevisions(flowId).catch((err) => {
      console.warn(`[FlowRepository] Failed to cleanup old revisions: ${err.message}`)
    })

    return revision
  }

  /**
   * Cleanup old revisions - keep only the latest N per workflow
   */
  async cleanupOldRevisions(flowId: string, keepCount: number = MAX_REVISIONS_PER_WORKFLOW): Promise<number> {
    // Get all revisions ordered by version descending
    const { data: revisions, error: fetchError } = await this.withFallback((client) =>
      client
        .from(WORKFLOWS_REVISIONS_TABLE)
        .select("id, version")
        .eq("workflow_id", flowId)
        .order("version", { ascending: false })
    )

    if (fetchError) {
      throw new Error(`Failed to fetch revisions for cleanup: ${fetchError.message}`)
    }

    if (!revisions || revisions.length <= keepCount) {
      return 0 // Nothing to delete
    }

    // Get IDs of revisions to delete (all except the latest keepCount)
    const revisionsToDelete = revisions.slice(keepCount).map((r) => r.id)

    if (revisionsToDelete.length === 0) {
      return 0
    }

    const { error: deleteError } = await this.withFallback((client) =>
      client
        .from(WORKFLOWS_REVISIONS_TABLE)
        .delete()
        .in("id", revisionsToDelete)
    )

    if (deleteError) {
      throw new Error(`Failed to delete old revisions: ${deleteError.message}`)
    }

    console.log(`[FlowRepository] Cleaned up ${revisionsToDelete.length} old revisions for flow ${flowId}`)
    return revisionsToDelete.length
  }

}

export type FlowRepositoryInstance = FlowRepository
