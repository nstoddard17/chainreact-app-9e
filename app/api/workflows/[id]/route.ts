import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  cookies()
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

    // First try to get the workflow by owner
    let { data, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", resolvedParams.id)
      .eq("user_id", user.id)
      .single()

    // If not found as owner, check if user has shared access
    if (error && (error.code === 'PGRST116' || error.message.includes('No rows'))) {
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

      data = sharedData
      error = sharedError
    }

    if (error) {
      // Check if it's a "not found" error vs actual server error
      if (error.code === 'PGRST116' || error.message.includes('No rows')) {
        return NextResponse.json({ error: "Workflow not found or access denied" }, { status: 404 })
      }
      console.error('Workflow fetch error:', error)
      return NextResponse.json({ error: "Failed to fetch workflow" }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: "Workflow not found or access denied" }, { status: 404 })
    }

    console.log('🔍 [Workflow API] Returning workflow data:', {
      id: data.id,
      name: data.name,
      nameType: typeof data.name,
      nameIsEmpty: !data.name,
      nameIsNull: data.name === null,
      nameIsUndefined: data.name === undefined,
      nameValue: JSON.stringify(data.name)
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('Workflow API error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  cookies()
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
      bodyKeys: Object.keys(body)
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
  cookies()
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
