import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "../../../../utils/supabase/server"
import { z } from "zod"

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
  const supabase = createSupabaseRouteHandlerClient()

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
  const supabase = createSupabaseRouteHandlerClient()

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
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 })
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
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const supabase = createSupabaseRouteHandlerClient()
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
      return NextResponse.json({ error: "Failed to fetch workflows" }, { status: 500 })
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

    return NextResponse.json({
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const keyData = await authenticateApiKey(request)
    if (!keyData) {
      await logApiUsage(null, null, null, "/api/v1/workflows", "POST", 401, Date.now() - startTime, request)
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 })
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
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createWorkflowSchema.parse(body)

    const supabase = createSupabaseRouteHandlerClient()
    const { data: workflow, error } = await supabase
      .from("workflows")
      .insert({
        ...validatedData,
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
      return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 })
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

    return NextResponse.json({ data: workflow }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logApiUsage(null, null, null, "/api/v1/workflows", "POST", 400, Date.now() - startTime, request)
      return NextResponse.json({ error: "Invalid request data", details: error.errors }, { status: 400 })
    }

    await logApiUsage(null, null, null, "/api/v1/workflows", "POST", 500, Date.now() - startTime, request)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
