import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

/**
 * POST /api/workflows/[id]/versions/[versionId]/restore
 * Restore a workflow to a previous version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, versionId } = await params

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
        { error: "You don't have permission to restore this workflow" },
        { status: 403 }
      )
    }

    // Get the version to restore
    const { data: version, error: versionError } = await supabase
      .from("workflow_versions")
      .select("*")
      .eq("id", versionId)
      .eq("workflow_id", id)
      .single()

    if (versionError || !version) {
      return NextResponse.json(
        { error: "Version not found" },
        { status: 404 }
      )
    }

    // Update the workflow with the version's state
    const { data: updatedWorkflow, error: updateError } = await supabase
      .from("workflows")
      .update({
        nodes: version.nodes,
        connections: version.connections,
        name: version.name || undefined, // Only update if version has a name
        description: version.description,
        last_modified_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("[workflow-versions] Error restoring version:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      workflow: updatedWorkflow,
      restored_from: {
        version_number: version.version_number,
        created_at: version.created_at,
      },
    })
  } catch (error: any) {
    console.error("[workflow-versions] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
