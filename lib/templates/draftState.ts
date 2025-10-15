import type { TemplateIntegrationSetup, TemplateSetupOverview } from "@/types/templateSetup"

export interface DraftUpdateBody {
  nodes?: any[]
  connections?: any[]
  default_field_values?: Record<string, any> | null
  integration_setup?: TemplateIntegrationSetup[] | null
  setup_overview?: TemplateSetupOverview | null
  primary_setup_target?: string | null
  status?: string
}

export interface DraftUpdateContext {
  existingDraftNodes: any[]
  existingDraftConnections: any[]
  existingDraftDefaults: Record<string, any>
  existingDraftIntegration: TemplateIntegrationSetup[]
  existingDraftOverview: TemplateSetupOverview | null
  existingPrimaryTarget: string | null
  existingStatus: string | null
}

export interface DraftUpdateComputation {
  resolvedNodes: any[]
  resolvedConnections: any[]
  resolvedDefaults: Record<string, any>
  resolvedIntegration: TemplateIntegrationSetup[]
  resolvedOverview: TemplateSetupOverview | null
  resolvedPrimaryTarget: string | null
  resolvedStatus: string
  updatePayload: Record<string, any>
}

const clone = <T>(value: T): T => {
  if (value === null || value === undefined) return value as T
  if (typeof structuredClone === "function") {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function sanitizeNodes(nodes: any[]): any[] {
  if (!Array.isArray(nodes)) return []
  return nodes.filter((node) => {
    if (!node) return false
    const nodeType = node?.data?.type || node?.type
    const hasAddButton = node?.data?.hasAddButton
    const isPlaceholder = node?.data?.isPlaceholder
    return (
      nodeType !== "addAction" &&
      nodeType !== "insertAction" &&
      nodeType !== "chain_placeholder" &&
      node?.type !== "addAction" &&
      node?.type !== "insertAction" &&
      node?.type !== "chainPlaceholder" &&
      !hasAddButton &&
      !isPlaceholder
    )
  })
}

export function resolveDraftUpdate(
  body: DraftUpdateBody,
  context: DraftUpdateContext,
  options: { now?: Date } = {}
): DraftUpdateComputation {
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()

  const resolvedNodes = Array.isArray(body.nodes)
    ? sanitizeNodes(body.nodes)
    : sanitizeNodes(context.existingDraftNodes)

  const resolvedConnections = Array.isArray(body.connections)
    ? clone(body.connections)
    : clone(context.existingDraftConnections)

  const resolvedDefaults =
    typeof body.default_field_values !== "undefined"
      ? clone(body.default_field_values ?? {})
      : clone(context.existingDraftDefaults)

  const resolvedIntegration =
    typeof body.integration_setup !== "undefined"
      ? clone(body.integration_setup ?? [])
      : clone(context.existingDraftIntegration)

  const resolvedOverview =
    typeof body.setup_overview !== "undefined"
      ? clone(body.setup_overview ?? null)
      : clone(context.existingDraftOverview)

  const resolvedPrimaryTarget =
    typeof body.primary_setup_target !== "undefined"
      ? body.primary_setup_target ?? null
      : context.existingPrimaryTarget ?? null

  const resolvedStatus =
    typeof body.status === "string" ? body.status : context.existingStatus ?? "draft"

  const updatePayload: Record<string, any> = {
    updated_at: nowIso,
  }

  if (Array.isArray(body.nodes)) {
    updatePayload.draft_nodes = resolvedNodes
  }

  if (Array.isArray(body.connections)) {
    updatePayload.draft_connections = resolvedConnections
  }

  if (typeof body.default_field_values !== "undefined") {
    updatePayload.draft_default_field_values = body.default_field_values ?? null
  }

  if (typeof body.integration_setup !== "undefined") {
    updatePayload.draft_integration_setup = body.integration_setup ?? null
  }

  if (typeof body.setup_overview !== "undefined") {
    updatePayload.draft_setup_overview = body.setup_overview ?? null
  }

  if (typeof body.primary_setup_target !== "undefined") {
    updatePayload.primary_setup_target = body.primary_setup_target ?? null
  }

  if (typeof body.status === "string") {
    updatePayload.status = body.status
    if (body.status === "published") {
      updatePayload.published_at = nowIso
    } else {
      updatePayload.published_at = null
    }
  }

  if (resolvedStatus === "published") {
    updatePayload.nodes = resolvedNodes
    updatePayload.connections = resolvedConnections
    updatePayload.default_field_values = resolvedDefaults
    updatePayload.integration_setup = resolvedIntegration
    updatePayload.setup_overview = resolvedOverview
    updatePayload.workflow_json = {
      nodes: resolvedNodes,
      connections: resolvedConnections,
    }
    updatePayload.is_public = true
    updatePayload.primary_setup_target = resolvedPrimaryTarget
    if (!updatePayload.published_at) {
      updatePayload.published_at = nowIso
    }
  } else if (typeof body.status === "string" && body.status !== "published") {
    updatePayload.is_public = false
  }

  return {
    resolvedNodes,
    resolvedConnections,
    resolvedDefaults,
    resolvedIntegration,
    resolvedOverview,
    resolvedPrimaryTarget,
    resolvedStatus,
    updatePayload,
  }
}

