import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the template
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("*")
      .eq("id", params.id)
      .eq("is_public", true)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    // Create a new workflow from the template
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .insert({
        name: `${template.name} (Copy)`,
        description: template.description,
        user_id: session.user.id,
        nodes: template.workflow_json.nodes || [],
        connections: template.workflow_json.connections || [],
        status: "draft",
      })
      .select()
      .single()

    if (workflowError) {
      console.error("Error creating workflow from template:", workflowError)
      return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 })
    }

    return NextResponse.json({ workflow })
  } catch (error) {
    console.error("Error copying template:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
