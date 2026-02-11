import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

interface Comment {
  id: string
  workflow_id: string
  node_id: string | null
  user_id: string
  content: string
  created_at: string
  updated_at: string
  resolved_at: string | null
  resolved_by: string | null
  parent_id: string | null
  user_email: string | null
  user_name: string | null
  replies?: Comment[]
}

/**
 * GET /api/workflows/[id]/comments
 * Get all comments for a workflow
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
    const { searchParams } = new URL(request.url)
    const nodeId = searchParams.get("nodeId")
    const includeResolved = searchParams.get("includeResolved") === "true"

    // Check workflow ownership
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("user_id")
      .eq("id", id)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      )
    }

    if (workflow.user_id !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to view comments" },
        { status: 403 }
      )
    }

    // Build query
    let query = supabase
      .from("workflow_comments")
      .select("*")
      .eq("workflow_id", id)
      .order("created_at", { ascending: true })

    // Filter by node if specified
    if (nodeId) {
      query = query.eq("node_id", nodeId)
    }

    // Filter out resolved by default
    if (!includeResolved) {
      query = query.is("resolved_at", null)
    }

    const { data: comments, error } = await query

    if (error) {
      console.error("[workflow-comments] Error fetching comments:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Organize into threads (parent comments with replies)
    const parentComments = (comments || []).filter((c: Comment) => !c.parent_id)
    const replies = (comments || []).filter((c: Comment) => c.parent_id)

    const threaded = parentComments.map((parent: Comment) => ({
      ...parent,
      replies: replies.filter((r: Comment) => r.parent_id === parent.id),
    }))

    return NextResponse.json({ comments: threaded })
  } catch (error: any) {
    console.error("[workflow-comments] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/workflows/[id]/comments
 * Create a new comment
 */
export async function POST(
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
    const { content, nodeId, parentId } = body

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "Comment content is required" },
        { status: 400 }
      )
    }

    // Check workflow ownership
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("user_id")
      .eq("id", id)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      )
    }

    if (workflow.user_id !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to comment" },
        { status: 403 }
      )
    }

    // Get user profile for display info
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single()

    // Create the comment
    const { data: comment, error } = await supabase
      .from("workflow_comments")
      .insert({
        workflow_id: id,
        node_id: nodeId || null,
        user_id: user.id,
        content: content.trim(),
        parent_id: parentId || null,
        user_email: profile?.email || user.email,
        user_name: profile?.full_name || null,
      })
      .select()
      .single()

    if (error) {
      console.error("[workflow-comments] Error creating comment:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ comment })
  } catch (error: any) {
    console.error("[workflow-comments] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
