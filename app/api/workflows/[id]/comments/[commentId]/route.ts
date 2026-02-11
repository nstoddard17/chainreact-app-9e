import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

/**
 * PATCH /api/workflows/[id]/comments/[commentId]
 * Update a comment (content or resolve status)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, commentId } = await params
    const body = await request.json()
    const { content, resolve } = body

    // Get the comment to check ownership
    const { data: comment, error: commentError } = await supabase
      .from("workflow_comments")
      .select("*, workflow:workflows(user_id)")
      .eq("id", commentId)
      .eq("workflow_id", id)
      .single()

    if (commentError || !comment) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      )
    }

    // Check permissions
    const isOwner = comment.user_id === user.id
    const isWorkflowOwner = comment.workflow?.user_id === user.id

    if (!isOwner && !isWorkflowOwner) {
      return NextResponse.json(
        { error: "You don't have permission to update this comment" },
        { status: 403 }
      )
    }

    // Build update object
    const updateData: Record<string, any> = {}

    // Only the comment author can update content
    if (content !== undefined && isOwner) {
      updateData.content = content.trim()
    }

    // Anyone with access can resolve/unresolve
    if (resolve !== undefined) {
      if (resolve) {
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by = user.id
      } else {
        updateData.resolved_at = null
        updateData.resolved_by = null
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 }
      )
    }

    const { data: updated, error } = await supabase
      .from("workflow_comments")
      .update(updateData)
      .eq("id", commentId)
      .select()
      .single()

    if (error) {
      console.error("[workflow-comments] Error updating comment:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ comment: updated })
  } catch (error: any) {
    console.error("[workflow-comments] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/workflows/[id]/comments/[commentId]
 * Delete a comment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, commentId } = await params

    // Get the comment to check ownership
    const { data: comment, error: commentError } = await supabase
      .from("workflow_comments")
      .select("*, workflow:workflows(user_id)")
      .eq("id", commentId)
      .eq("workflow_id", id)
      .single()

    if (commentError || !comment) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      )
    }

    // Check permissions - only author or workflow owner can delete
    const isOwner = comment.user_id === user.id
    const isWorkflowOwner = comment.workflow?.user_id === user.id

    if (!isOwner && !isWorkflowOwner) {
      return NextResponse.json(
        { error: "You don't have permission to delete this comment" },
        { status: 403 }
      )
    }

    const { error } = await supabase
      .from("workflow_comments")
      .delete()
      .eq("id", commentId)

    if (error) {
      console.error("[workflow-comments] Error deleting comment:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[workflow-comments] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
