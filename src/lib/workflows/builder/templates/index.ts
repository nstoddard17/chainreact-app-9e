import { randomUUID } from "crypto"

import { createSupabaseServiceClient } from "@/utils/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { FlowSchema, type Flow } from "../schema"
import { FlowRepository } from "../repo"

export interface TemplateMetadata {
  name: string
  description?: string
  tags?: string[]
  thumbnailUrl?: string
  workspaceId?: string
  createdBy?: string
}

async function resolveClient(client?: SupabaseClient<any>) {
  return client ?? (await createSupabaseServiceClient())
}

export async function listTemplates(workspaceId?: string, client?: SupabaseClient<any>) {
  const supabase = await resolveClient(client)
  const query = supabase
    .from("flow_v2_templates")
    .select("id, name, description, tags, thumbnail_url, flow_id, revision_id, created_at")
    .order("created_at", { ascending: false })

  if (workspaceId) {
    query.eq("workspace_id", workspaceId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function saveTemplate({
  flowId,
  revisionId,
  graph,
  metadata,
  client,
}: {
  flowId: string
  revisionId: string
  graph: Flow
  metadata: TemplateMetadata
  client?: SupabaseClient<any>
}) {
  const supabase = await resolveClient(client)
  const id = randomUUID()
  const { error } = await supabase.from("flow_v2_templates").insert({
    id,
    flow_id: flowId,
    revision_id: revisionId,
    workspace_id: metadata.workspaceId ?? null,
    name: metadata.name,
    description: metadata.description ?? null,
    tags: metadata.tags ?? [],
    thumbnail_url: metadata.thumbnailUrl ?? null,
    graph,
    metadata: {
      createdBy: metadata.createdBy ?? null,
    },
    created_by: metadata.createdBy ?? null,
  })
  if (error) throw new Error(error.message)
  return { id }
}

export async function loadTemplate(templateId: string, client?: SupabaseClient<any>) {
  const supabase = await resolveClient(client)
  const { data, error } = await supabase
    .from("flow_v2_templates")
    .select("id, name, description, tags, thumbnail_url, graph")
    .eq("id", templateId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    ...data,
    graph: FlowSchema.parse(data.graph),
  }
}

export async function instantiateTemplate({
  templateId,
  workspaceId,
  createdBy,
  name,
  client,
}: {
  templateId: string
  workspaceId?: string
  createdBy?: string
  name?: string
  client?: SupabaseClient<any>
}) {
  const supabase = await resolveClient(client)
  const template = await loadTemplate(templateId, supabase)
  if (!template) {
    throw new Error("Template not found")
  }
  const repository = await FlowRepository.create(supabase)
  const newFlowId = randomUUID()

  await supabase.from("flow_v2_definitions").insert({
    id: newFlowId,
    name: name ?? `${template.name} Copy`,
    workspace_id: workspaceId ?? null,
    owner_id: createdBy ?? null,
  })

  const revision = await repository.createRevision({
    flowId: newFlowId,
    flow: {
      ...template.graph,
      id: newFlowId,
      name: name ?? template.name,
      version: 1,
    },
    version: 1,
  })

  return { flowId: newFlowId, revisionId: revision.id }
}
