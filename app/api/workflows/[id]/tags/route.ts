import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

/**
 * GET /api/workflows/[id]/tags
 * Get tags for a specific workflow
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const { data: workflow, error } = await supabase
      .from("workflows")
      .select("id, tags")
      .eq("id", id)
      .single()

    if (error) {
      console.error("[workflow-tags] Error fetching workflow:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    return NextResponse.json({ tags: workflow.tags || [] })
  } catch (error: any) {
    console.error("[workflow-tags] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/workflows/[id]/tags
 * Update tags for a specific workflow
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { tags } = body

    if (!Array.isArray(tags)) {
      return NextResponse.json(
        { error: "tags must be an array" },
        { status: 400 }
      )
    }

    // Validate tags (must be strings, no empty strings)
    const validTags = tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    const { data: workflow, error } = await supabase
      .from("workflows")
      .update({ tags: validTags, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[workflow-tags] Error updating workflow:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ tags: workflow.tags || [] })
  } catch (error: any) {
    console.error("[workflow-tags] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
