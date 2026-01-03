import { randomUUID } from "crypto"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"

import { FlowSchema, type Flow, type FlowEdge, type JsonValue, JsonValueSchema } from "./schema"

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
const LEGACY_CREATE_REVISION_FUNCTIONS = ["workflows_create_revision", "flow_v2_create_revision"] as const

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
    const executeQuery = (client: FlowRepositoryClient) => {
      const query = client
        .from(WORKFLOWS_REVISIONS_TABLE)
        .select("id, workflow_id, version, graph, created_at, published, published_at")
        .eq("workflow_id", flowId)

      if (typeof version === "number") {
        query.eq("version", version)
      } else {
        query.order("version", { ascending: false }).limit(1)
      }

      return query.maybeSingle()
    }

    const { data, error } = await this.withFallback(executeQuery)

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

}

export type FlowRepositoryInstance = FlowRepository
