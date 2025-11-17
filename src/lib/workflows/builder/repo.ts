import { randomUUID } from "crypto"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"

import { FlowSchema, type Flow, type JsonValue, JsonValueSchema } from "./schema"

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
  flow_id: z.string().uuid(),
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

  constructor(client: FlowRepositoryClient) {
    this.client = client
  }

  static create(client: FlowRepositoryClient) {
    return new FlowRepository(client)
  }

  async createDefinition({ id = randomUUID(), name }: CreateFlowDefinitionParams): Promise<FlowDefinitionRecord> {
    const now = new Date().toISOString()

    const { data, error } = await this.client
      .from("flow_v2_definitions")
      .insert({ id, name, created_at: now })
      .select("id, name, created_at")
      .single()

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
    const { data, error } = await this.client
      .from("flow_v2_definitions")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })

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
    const validated = FlowSchema.parse(flow)

    // If version is explicitly provided, use the old insert method
    if (typeof version === "number") {
      const now = new Date().toISOString()

      const { data, error } = await this.client
        .from("flow_v2_revisions")
        .insert({
          id,
          flow_id: flowId,
          version,
          graph: validated,
          created_at: now,
        })
        .select("id, flow_id, version, graph, created_at")
        .single()

      if (error) {
        throw new Error(`Failed to create flow revision: ${error.message}`)
      }

      const parsed = FlowRevisionRowSchema.parse(data)
      return {
        id: parsed.id,
        flowId: parsed.flow_id,
        version: parsed.version,
        graph: FlowSchema.parse(parsed.graph as JsonValue),
        createdAt: parsed.created_at,
      }
    }

    // Use atomic create function that does version increment + insert in one transaction
    const now = new Date().toISOString()

    const { data, error } = await this.client
      .rpc("flow_v2_create_revision", {
        p_id: id,
        p_flow_id: flowId,
        p_graph: validated,
        p_created_at: now,
      })
      .single()

    if (error) {
      throw new Error(`Failed to create flow revision atomically: ${error.message}`)
    }

    const parsed = FlowRevisionRowSchema.parse(data)
    return {
      id: parsed.id,
      flowId: parsed.flow_id,
      version: parsed.version,
      graph: FlowSchema.parse(parsed.graph as JsonValue),
      createdAt: parsed.created_at,
    }
  }

  async loadRevision({ flowId, version }: LoadFlowRevisionParams): Promise<FlowRevisionRecord | null> {
    const query = this.client
      .from("flow_v2_revisions")
      .select("id, flow_id, version, graph, created_at")
      .eq("flow_id", flowId)

    if (typeof version === "number") {
      query.eq("version", version)
    } else {
      query.order("version", { ascending: false }).limit(1)
    }

    const { data, error } = await query.maybeSingle()

    if (error) {
      throw new Error(`Failed to load flow revision: ${error.message}`)
    }

    if (!data) {
      return null
    }

    const parsed = FlowRevisionRowSchema.parse(data)

    return {
      id: parsed.id,
      flowId: parsed.flow_id,
      version: parsed.version,
      graph: FlowSchema.parse(parsed.graph as JsonValue),
      createdAt: parsed.created_at,
      published: parsed.published ?? false,
      publishedAt: parsed.published_at ?? null,
    }
  }

  async loadRevisionById(id: string): Promise<FlowRevisionRecord | null> {
    const { data, error } = await this.client
      .from("flow_v2_revisions")
      .select("id, flow_id, version, graph, created_at")
      .eq("id", id)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load flow revision by id: ${error.message}`)
    }

    if (!data) {
      return null
    }

    const parsed = FlowRevisionRowSchema.parse(data)

    return {
      id: parsed.id,
      flowId: parsed.flow_id,
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

    const { data, error } = await this.client
      .from("flow_v2_revisions")
      .select("id, version, created_at, published, published_at")
      .eq("flow_id", flowId)
      .order("version", { ascending: false })

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
