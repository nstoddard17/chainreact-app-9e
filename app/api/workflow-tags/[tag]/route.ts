import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

/**
 * DELETE /api/workflow-tags/[tag]
 * Delete a tag globally (remove from all workflows)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { tag } = await params
    const decodedTag = decodeURIComponent(tag)

    // Get all user's workflows that have this tag
    const { data: workflows, error: fetchError } = await supabase
      .from("workflows")
      .select("id, tags")
      .eq("user_id", user.id)
      .contains("tags", [decodedTag])

    if (fetchError) {
      console.error("[workflow-tags] Error fetching workflows:", fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Remove tag from each workflow
    for (const workflow of workflows || []) {
      const newTags = (workflow.tags || []).filter(
        (t: string) => t !== decodedTag
      )
      const { error: updateError } = await supabase
        .from("workflows")
        .update({ tags: newTags })
        .eq("id", workflow.id)

      if (updateError) {
        console.error(
          `[workflow-tags] Error updating workflow ${workflow.id}:`,
          updateError
        )
      }
    }

    // Delete the tag setting
    const { error: deleteError } = await supabase
      .from("workflow_tag_settings")
      .delete()
      .eq("user_id", user.id)
      .eq("tag_name", decodedTag)

    if (deleteError) {
      console.error("[workflow-tags] Error deleting setting:", deleteError)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[workflow-tags] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
