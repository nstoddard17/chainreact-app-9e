import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/utils/supabase/server"
import { parseJsonField, requireTemplateAccess } from "./helpers"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const { template, errorResponse } = await requireTemplateAccess(templateId)
    if (errorResponse) return errorResponse

    const nodes = parseJsonField<any[]>(template.nodes) || []
    const connections = parseJsonField<any[]>(template.connections) || []
    const airtableSetup = parseJsonField(template.airtable_setup) ?? template.airtable_setup ?? null
    const integrationSetup = parseJsonField(template.integration_setup) ?? template.integration_setup ?? null
    const defaultFieldValues = parseJsonField<Record<string, any>>(template.default_field_values) || {}
    const setupOverview = parseJsonField(template.setup_overview)
    const draftNodes = parseJsonField<any[]>(template.draft_nodes) || []
    const draftConnections = parseJsonField<any[]>(template.draft_connections) || []
    const draftDefaultFieldValues = parseJsonField<Record<string, any>>(template.draft_default_field_values) || {}
    const draftIntegrationSetup = parseJsonField(template.draft_integration_setup)
    const draftSetupOverview = parseJsonField(template.draft_setup_overview)
    const hydratedTemplate = {
      ...template,
      nodes,
      connections,
      airtable_setup: airtableSetup,
      airtableSetup: airtableSetup,
      integration_setup: integrationSetup,
      integrationSetup,
      default_field_values: defaultFieldValues,
      defaultFieldValues,
      setup_overview: setupOverview,
      setupOverview,
      draft_nodes: draftNodes,
      draftNodes,
      draft_connections: draftConnections,
      draftConnections,
      draft_default_field_values: draftDefaultFieldValues,
      draftDefaultFieldValues,
      draft_integration_setup: draftIntegrationSetup,
      draftIntegrationSetup,
      draft_setup_overview: draftSetupOverview,
      draftSetupOverview,
    }

    return NextResponse.json({
      template: hydratedTemplate,
      nodes,
      connections,
    })
  } catch (error) {
    console.error("Error in GET /api/templates/[id]:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const { errorResponse, template: existingTemplate } = await requireTemplateAccess(templateId)
    if (errorResponse) return errorResponse

    const body = await request.json()
    const {
      nodes = [],
      connections = [],
      name,
      description,
      category,
      tags,
      is_public,
      thumbnail_url,
      workflow_json,
      airtable_setup,
      integration_setup,
      primary_setup_target,
      setup_overview,
      default_field_values,
      status,
      published_at
    } = body || {}

    const hasNodes = Object.prototype.hasOwnProperty.call(body || {}, 'nodes')
    const hasConnections = Object.prototype.hasOwnProperty.call(body || {}, 'connections')
    const hasWorkflowJson = Object.prototype.hasOwnProperty.call(body || {}, 'workflow_json')

    const filteredNodes = Array.isArray(nodes) ? nodes.filter((node: any) => {
      const nodeType = node.data?.type || node.type
      const hasAddButton = node.data?.hasAddButton
      const isPlaceholder = node.data?.isPlaceholder

      return nodeType !== 'addAction'
        && nodeType !== 'insertAction'
        && nodeType !== 'chain_placeholder'
        && !hasAddButton
        && !isPlaceholder
    }) : []

    const serviceClient = await createSupabaseServiceClient()

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (hasNodes) {
      updatePayload.nodes = filteredNodes
    }

    if (hasConnections && Array.isArray(connections)) {
      updatePayload.connections = connections
    }

    if (hasWorkflowJson) {
      updatePayload.workflow_json = workflow_json
    } else if (hasNodes || hasConnections) {
      const resolvedConnections = hasConnections && Array.isArray(connections)
        ? connections
        : parseJsonField(existingTemplate?.connections) || existingTemplate?.connections || []
      updatePayload.workflow_json = {
        nodes: filteredNodes,
        connections: resolvedConnections,
      }
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'name') && typeof name === 'string') {
      updatePayload.name = name
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'description') && typeof description === 'string') {
      updatePayload.description = description
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'category') && typeof category === 'string') {
      updatePayload.category = category
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'tags') && Array.isArray(tags)) {
      updatePayload.tags = tags
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'is_public') && typeof is_public === 'boolean') {
      updatePayload.is_public = is_public
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'thumbnail_url') && typeof thumbnail_url === 'string') {
      updatePayload.thumbnail_url = thumbnail_url
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'airtable_setup')) {
      updatePayload.airtable_setup = airtable_setup ?? null
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'integration_setup')) {
      updatePayload.integration_setup = integration_setup ?? null
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'primary_setup_target')) {
      updatePayload.primary_setup_target = primary_setup_target ?? null
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'setup_overview')) {
      updatePayload.setup_overview = setup_overview ?? null
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'default_field_values')) {
      updatePayload.default_field_values = default_field_values ?? null
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'status') && typeof status === 'string') {
      updatePayload.status = status
      if (status === 'published') {
        updatePayload.published_at = new Date().toISOString()
      }
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, 'published_at')) {
      updatePayload.published_at = published_at
    }

    const { data: updatedTemplate, error } = await serviceClient
      .from("templates")
      .update(updatePayload)
      .eq("id", templateId)
      .select()
      .single()

    if (error) {
      console.error("Error updating template:", error)
      return NextResponse.json(
        { error: "Failed to update template" },
        { status: 500 }
      )
    }

    const parsedNodes = parseJsonField<any[]>(updatedTemplate.nodes) || filteredNodes
    const parsedConnections = parseJsonField<any[]>(updatedTemplate.connections) || connections
    const parsedAirtableSetup = parseJsonField(updatedTemplate.airtable_setup) ?? updatePayload.airtable_setup ?? null
    const parsedIntegrationSetup = parseJsonField(updatedTemplate.integration_setup) ?? updatePayload.integration_setup ?? null
    const parsedDefaultFieldValues = parseJsonField<Record<string, any>>(updatedTemplate.default_field_values) || updatePayload.default_field_values || {}
    const parsedSetupOverview = parseJsonField(updatedTemplate.setup_overview) ?? updatePayload.setup_overview ?? null

    return NextResponse.json({
      template: {
        ...updatedTemplate,
        nodes: parsedNodes,
        connections: parsedConnections,
        airtable_setup: parsedAirtableSetup,
        airtableSetup: parsedAirtableSetup,
        integration_setup: parsedIntegrationSetup,
        integrationSetup: parsedIntegrationSetup,
        default_field_values: parsedDefaultFieldValues,
        defaultFieldValues: parsedDefaultFieldValues,
        setup_overview: parsedSetupOverview,
        setupOverview: parsedSetupOverview,
      },
      message: "Template updated successfully"
    })
  } catch (error) {
    console.error("Error in PUT /api/templates/[id]:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
