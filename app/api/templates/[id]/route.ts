import { createSupabaseServerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

async function requireTemplateAccess(templateId: string) {
  cookies()
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      supabase,
      user: null as any,
      template: null as any,
      errorResponse: NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error("Error fetching user profile for template access:", profileError)
  }

  const serviceClient = await createSupabaseServiceClient()

  const { data: template, error: templateError } = await serviceClient
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle()

  if (templateError) {
    console.error("Error fetching template for access check:", templateError)
  }

  if (!template) {
    return {
      supabase,
      user,
      template: null as any,
      errorResponse: NextResponse.json({ error: "Template not found" }, { status: 404 }),
    }
  }

  const isAdmin = profile?.role === "admin"
  const createdBy =
    (template as any)?.created_by ??
    (template as any)?.user_id ??
    (template as any)?.owner_id ??
    (template as any)?.author_id ??
    null

  if (!isAdmin && createdBy !== user.id) {
    return {
      supabase,
      user,
      template: null as any,
      errorResponse: NextResponse.json({ error: "Only admins or template owners can manage templates" }, { status: 403 }),
    }
  }

  return { supabase, user, template, errorResponse: null as any }
}

function parseJsonField(field: unknown) {
  if (typeof field === "string") {
    try {
      return JSON.parse(field)
    } catch (error) {
      console.error("Failed to parse template field", error)
      return null
    }
  }
  return field
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const { template, errorResponse } = await requireTemplateAccess(templateId)
    if (errorResponse) return errorResponse

    const nodes = parseJsonField(template.nodes) || []
    const connections = parseJsonField(template.connections) || []
    const hydratedTemplate = {
      ...template,
      nodes,
      connections,
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
      workflow_json
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

    const parsedNodes = parseJsonField(updatedTemplate.nodes) || filteredNodes
    const parsedConnections = parseJsonField(updatedTemplate.connections) || connections

    return NextResponse.json({
      template: {
        ...updatedTemplate,
        nodes: parsedNodes,
        connections: parsedConnections,
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
