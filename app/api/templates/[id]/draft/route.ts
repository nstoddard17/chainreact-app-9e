import { NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/utils/supabase/server"
import { parseJsonField, requireTemplateAccess } from "../helpers"

function sanitizeNodes(nodes: any[]): any[] {
  if (!Array.isArray(nodes)) return []
  return nodes.filter((node) => {
    const nodeType = node?.data?.type || node?.type
    const hasAddButton = node?.data?.hasAddButton
    const isPlaceholder = node?.data?.isPlaceholder
    return (
      nodeType !== "addAction" &&
      nodeType !== "insertAction" &&
      nodeType !== "chain_placeholder" &&
      !hasAddButton &&
      !isPlaceholder
    )
  })
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { template, errorResponse } = await requireTemplateAccess(id)
    if (errorResponse) return errorResponse

    const draftNodes = parseJsonField<any[]>(template.draft_nodes) || []
    const draftConnections = parseJsonField<any[]>(template.draft_connections) || []
    const draftDefaultFieldValues = parseJsonField<Record<string, any>>(template.draft_default_field_values) || {}
    const draftIntegrationSetup = parseJsonField(template.draft_integration_setup)
    const draftSetupOverview = parseJsonField(template.draft_setup_overview)
    const defaultFieldValues = parseJsonField<Record<string, any>>(template.default_field_values) || {}
    const integrationSetup = parseJsonField(template.integration_setup)
    const setupOverview = parseJsonField(template.setup_overview)

    return NextResponse.json({
      draft: {
        nodes: draftNodes,
        connections: draftConnections,
        default_field_values: draftDefaultFieldValues,
        integration_setup: draftIntegrationSetup,
        setup_overview: draftSetupOverview,
        primary_setup_target: template.primary_setup_target,
        status: template.status,
        published_nodes: parseJsonField<any[]>(template.nodes) || [],
        published_connections: parseJsonField<any[]>(template.connections) || [],
        published_default_field_values: defaultFieldValues,
        published_integration_setup: integrationSetup,
        published_setup_overview: setupOverview,
        published_at: template.published_at,
      },
    })
  } catch (error) {
    console.error("[TemplateDraft] Failed to fetch draft template", error)
    return NextResponse.json(
      { error: "Failed to fetch template draft" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { template, errorResponse } = await requireTemplateAccess(id)
    if (errorResponse) return errorResponse

    const body = await request.json()
    const {
      nodes,
      connections,
      default_field_values,
      integration_setup,
      setup_overview,
      primary_setup_target,
      status,
    } = body || {}

    const serviceClient = await createSupabaseServiceClient()
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (Array.isArray(nodes)) {
      updatePayload.draft_nodes = sanitizeNodes(nodes)
    }

    if (Array.isArray(connections)) {
      updatePayload.draft_connections = connections
    }

    if (typeof default_field_values !== "undefined") {
      updatePayload.draft_default_field_values = default_field_values ?? null
    }

    if (typeof integration_setup !== "undefined") {
      updatePayload.draft_integration_setup = integration_setup ?? null
    }

    if (typeof setup_overview !== "undefined") {
      updatePayload.draft_setup_overview = setup_overview ?? null
    }

    if (typeof primary_setup_target !== "undefined") {
      updatePayload.primary_setup_target = primary_setup_target ?? null
    }

    if (typeof status === "string") {
      updatePayload.status = status
      if (status === "published" && !template.published_at) {
        updatePayload.published_at = new Date().toISOString()
      }
      if (status !== "published") {
        updatePayload.published_at = null
      }
    }

    const { data: updatedTemplate, error } = await serviceClient
      .from("templates")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      console.error("[TemplateDraft] Failed to update draft", error)
      return NextResponse.json(
        { error: "Failed to update template draft" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      draft: {
        nodes: parseJsonField<any[]>(updatedTemplate.draft_nodes) || [],
        connections: parseJsonField<any[]>(updatedTemplate.draft_connections) || [],
        default_field_values: parseJsonField<Record<string, any>>(updatedTemplate.draft_default_field_values) || {},
        integration_setup: parseJsonField(updatedTemplate.draft_integration_setup),
        setup_overview: parseJsonField(updatedTemplate.draft_setup_overview),
        primary_setup_target: updatedTemplate.primary_setup_target,
        status: updatedTemplate.status,
      },
      message: "Draft saved",
    })
  } catch (error) {
    console.error("[TemplateDraft] Failed to save draft", error)
    return NextResponse.json(
      { error: "Failed to save template draft" },
      { status: 500 }
    )
  }
}
