import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const resolvedParams = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(resolvedParams.id)) {
      return NextResponse.json({ error: "Invalid workflow ID format" }, { status: 400 })
    }

    // First try to get the workflow by ID only to see if it exists
    const { data: workflowExists, error: existsError } = await supabase
      .from("workflows")
      .select("id, user_id")
      .eq("id", resolvedParams.id)
      .single()

    if (existsError || !workflowExists) {
      console.error('Workflow does not exist:', resolvedParams.id, existsError)
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    // Log for debugging
    console.log('🔍 [Workflow API] Checking access:', {
      workflowId: resolvedParams.id,
      workflowOwnerId: workflowExists.user_id,
      currentUserId: user.id,
      isOwner: workflowExists.user_id === user.id
    })

    // Check if user is the owner
    if (workflowExists.user_id === user.id) {
      // User is the owner, fetch full data
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("id", resolvedParams.id)
        .single()

      if (error) {
        console.error('Error fetching owned workflow:', error)
        return NextResponse.json({ error: "Failed to fetch workflow" }, { status: 500 })
      }

      return NextResponse.json(data)
    }

    // Not the owner, check if user has shared access
    const { data: sharedData, error: sharedError } = await supabase
      .from("workflows")
      .select(`
        *,
        workflow_shares!inner(
          permission,
          shared_with
        )
      `)
      .eq("id", resolvedParams.id)
      .eq("workflow_shares.shared_with", user.id)
      .single()

    if (sharedError || !sharedData) {
      console.error('User does not have access to workflow:', {
        workflowId: resolvedParams.id,
        userId: user.id,
        error: sharedError
      })
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    console.log('🔍 [Workflow API] Returning shared workflow data:', {
      id: sharedData.id,
      name: sharedData.name,
      nameType: typeof sharedData.name,
      nameIsEmpty: !sharedData.name,
      nameIsNull: sharedData.name === null,
      nameIsUndefined: sharedData.name === undefined,
      nameValue: JSON.stringify(sharedData.name)
    })

    return NextResponse.json(sharedData)
  } catch (error) {
    console.error('Workflow API error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const resolvedParams = await params

    console.log('📝 [Workflow API] Updating workflow with body:', {
      id: resolvedParams.id,
      name: body.name,
      hasName: 'name' in body,
      nameType: typeof body.name,
      bodyKeys: Object.keys(body),
      nodesCount: body.nodes?.length,
      connectionsCount: body.connections?.length
    })

    const { data, error } = await supabase
      .from("workflows")
      .update(body)
      .eq("id", resolvedParams.id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const resolvedParams = await params

    const { error } = await supabase.from("workflows").delete().eq("id", resolvedParams.id).eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
