import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "../../../../utils/supabase/server"
import { z } from "zod"
import { randomUUID } from "crypto"

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  nodes: z.array(z.any()),
  connections: z.array(z.any()),
  variables: z.record(z.any()).optional(),
  configuration: z.record(z.any()).optional(),
})

async function authenticateApiKey(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return null
  }

  const apiKey = authHeader.substring(7)
  const supabase = await createSupabaseRouteHandlerClient()

  const { data: keyData } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", apiKey)
    .eq("is_active", true)
    .single()

  if (!keyData || (keyData.expires_at && new Date(keyData.expires_at) < new Date())) {
    return null
  }

  // Update last used timestamp
  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyData.id)

  return keyData
}

async function logApiUsage(
  apiKeyId: string | null,
  userId: string | null,
  organizationId: string | null,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTime: number,
  request: NextRequest,
) {
  const supabase = await createSupabaseRouteHandlerClient()

  await supabase.from("api_usage_logs").insert({
    api_key_id: apiKeyId,
    user_id: userId,
    organization_id: organizationId,
    endpoint,
    method,
    status_code: statusCode,
    response_time_ms: responseTime,
    ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
    user_agent: request.headers.get("user-agent"),
  })
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    const keyData = await authenticateApiKey(request)
    if (!keyData) {
      await logApiUsage(null, null, null, "/api/v1/workflows", "GET", 401, Date.now() - startTime, request)
      return errorResponse("Invalid API key" , 401)
    }

    if (!keyData.scopes.includes("workflows:read")) {
      await logApiUsage(
        keyData.id,
        keyData.user_id,
        keyData.organization_id,
        "/api/v1/workflows",
        "GET",
        403,
        Date.now() - startTime,
        request,
      )
      return errorResponse("Insufficient permissions" , 403)
    }

    const supabase = await createSupabaseRouteHandlerClient()
    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Math.min(Number.parseInt(searchParams.get("limit") || "20"), 100)
    const offset = (page - 1) * limit

    const query = supabase
      .from("workflows")
      .select("*", { count: "exact" })
      .eq("user_id", keyData.user_id)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false })

    if (keyData.organization_id) {
      query.eq("organization_id", keyData.organization_id)
    }

    const { data: workflows, error, count } = await query

    if (error) {
      await logApiUsage(
        keyData.id,
        keyData.user_id,
        keyData.organization_id,
        "/api/v1/workflows",
        "GET",
        500,
        Date.now() - startTime,
        request,
      )
      return errorResponse("Failed to fetch workflows" , 500)
    }

    await logApiUsage(
      keyData.id,
      keyData.user_id,
      keyData.organization_id,
      "/api/v1/workflows",
      "GET",
      200,
      Date.now() - startTime,
      request,
    )

    return jsonResponse({
      data: workflows,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    await logApiUsage(null, null, null, "/api/v1/workflows", "GET", 500, Date.now() - startTime, request)
    return errorResponse("Internal server error" , 500)
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const keyData = await authenticateApiKey(request)
    if (!keyData) {
      await logApiUsage(null, null, null, "/api/v1/workflows", "POST", 401, Date.now() - startTime, request)
      return errorResponse("Invalid API key" , 401)
    }

    if (!keyData.scopes.includes("workflows:write")) {
      await logApiUsage(
        keyData.id,
        keyData.user_id,
        keyData.organization_id,
        "/api/v1/workflows",
        "POST",
        403,
        Date.now() - startTime,
        request,
      )
      return errorResponse("Insufficient permissions" , 403)
    }

    const body = await request.json()
    const validatedData = createWorkflowSchema.parse(body)

    // Extract nodes and connections from validated data (they go to normalized tables)
    const { nodes, connections, ...workflowData } = validatedData

    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    const newWorkflowId = randomUUID()

    const { data: workflow, error } = await supabase
      .from("workflows")
      .insert({
        id: newWorkflowId,
        ...workflowData,
        user_id: keyData.user_id,
        organization_id: keyData.organization_id,
      })
      .select()
      .single()

    if (error) {
      await logApiUsage(
        keyData.id,
        keyData.user_id,
        keyData.organization_id,
        "/api/v1/workflows",
        "POST",
        500,
        Date.now() - startTime,
        request,
      )
      return errorResponse("Failed to create workflow" , 500)
    }

    // Insert nodes into normalized table
    if (nodes && nodes.length > 0) {
      const nodeIdMap = new Map<string, string>()
      const nodeRecords = nodes.map((node: any, index: number) => {
        const nodeId = node.id || randomUUID()
        nodeIdMap.set(node.id || nodeId, nodeId)
        return {
          id: nodeId,
          workflow_id: newWorkflowId,
          user_id: keyData.user_id,
          node_type: node.data?.type || node.type || 'unknown',
          label: node.data?.label || node.data?.title || node.data?.type || 'Unnamed Node',
          description: node.data?.description || null,
          config: node.data?.config || node.data || {},
          position_x: node.position?.x ?? 400,
          position_y: node.position?.y ?? (100 + index * 180),
          is_trigger: node.data?.isTrigger ?? false,
          provider_id: (node.data?.type || '').split(':')[0] || null,
          display_order: index,
          in_ports: [],
          out_ports: [],
          metadata: { position: node.position },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      })

      await serviceClient.from('workflow_nodes').insert(nodeRecords)

      // Insert edges into normalized table
      if (connections && connections.length > 0) {
        const edgeRecords = connections
          .filter((conn: any) => conn && (conn.source || conn.from) && (conn.target || conn.to))
          .map((conn: any) => {
            const sourceId = conn.source || conn.from
            const targetId = conn.target || conn.to
            return {
              id: conn.id || randomUUID(),
              workflow_id: newWorkflowId,
              user_id: keyData.user_id,
              source_node_id: nodeIdMap.get(sourceId) || sourceId,
              target_node_id: nodeIdMap.get(targetId) || targetId,
              source_port_id: conn.sourceHandle || 'source',
              target_port_id: conn.targetHandle || 'target',
              mappings: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          })

        if (edgeRecords.length > 0) {
          await serviceClient.from('workflow_edges').insert(edgeRecords)
        }
      }
    }

    await logApiUsage(
      keyData.id,
      keyData.user_id,
      keyData.organization_id,
      "/api/v1/workflows",
      "POST",
      201,
      Date.now() - startTime,
      request,
    )

    return jsonResponse({ data: workflow }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logApiUsage(null, null, null, "/api/v1/workflows", "POST", 400, Date.now() - startTime, request)
      return errorResponse("Invalid request data", 400, { details: error.errors  })
    }

    await logApiUsage(null, null, null, "/api/v1/workflows", "POST", 500, Date.now() - startTime, request)
    return errorResponse("Internal server error" , 500)
  }
}
