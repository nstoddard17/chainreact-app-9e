import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

/**
 * GET /api/workflows/[id]/versions
 * Get all versions for a workflow
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

    // Get versions ordered by version number descending
    const { data: versions, error } = await supabase
      .from("workflow_versions")
      .select(`
        id,
        version_number,
        created_at,
        created_by,
        change_summary,
        is_published,
        nodes_count,
        changes,
        name,
        description,
        status
      `)
      .eq("workflow_id", id)
      .order("version_number", { ascending: false })

    if (error) {
      console.error("[workflow-versions] Error fetching versions:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also get the current workflow state as "current version"
    const { data: currentWorkflow, error: workflowError } = await supabase
      .from("workflows")
      .select("name, description, status, nodes, connections, updated_at")
      .eq("id", id)
      .single()

    if (workflowError) {
      console.error("[workflow-versions] Error fetching workflow:", workflowError)
    }

    // Prepend current state as the "latest" version
    const allVersions = [
      ...(currentWorkflow
        ? [
            {
              id: "current",
              version_number: (versions?.[0]?.version_number || 0) + 1,
              created_at: currentWorkflow.updated_at,
              created_by: user.id,
              change_summary: "Current version",
              is_published: currentWorkflow.status === "active",
              nodes_count: currentWorkflow.nodes?.length || 0,
              changes: null,
              name: currentWorkflow.name,
              description: currentWorkflow.description,
              status: currentWorkflow.status,
              is_current: true,
            },
          ]
        : []),
      ...(versions || []).map((v) => ({ ...v, is_current: false })),
    ]

    return NextResponse.json({ versions: allVersions })
  } catch (error: any) {
    console.error("[workflow-versions] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/workflows/[id]/versions
 * Manually create a version snapshot (e.g., before major changes)
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
    const { change_summary } = body

    // Get current workflow state
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", id)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      )
    }

    // Check ownership
    if (workflow.user_id !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to create versions for this workflow" },
        { status: 403 }
      )
    }

    // Get next version number
    const { data: latestVersion } = await supabase
      .from("workflow_versions")
      .select("version_number")
      .eq("workflow_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single()

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1

    // Create version
    const { data: version, error } = await supabase
      .from("workflow_versions")
      .insert({
        workflow_id: id,
        version_number: nextVersionNumber,
        created_by: user.id,
        change_summary: change_summary || `Version ${nextVersionNumber}`,
        is_published: workflow.status === "active",
        nodes_count: workflow.nodes?.length || 0,
        nodes: workflow.nodes || [],
        connections: workflow.connections || [],
        name: workflow.name,
        description: workflow.description,
        status: workflow.status,
      })
      .select()
      .single()

    if (error) {
      console.error("[workflow-versions] Error creating version:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ version })
  } catch (error: any) {
    console.error("[workflow-versions] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
