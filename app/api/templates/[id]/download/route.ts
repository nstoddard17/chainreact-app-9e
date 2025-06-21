import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    cookies()
    const supabase = createSupabaseRouteHandlerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { organization_id } = body

    // Record the download
    const { error: downloadError } = await supabase.from("template_downloads").insert({
      template_id: params.id,
      user_id: session.user.id,
      organization_id: organization_id || null,
    })

    if (downloadError) {
      console.error("Error recording download:", downloadError)
      return NextResponse.json({ error: "Failed to record download" }, { status: 500 })
    }

    // Get the template data
    const { data: template, error } = await supabase.from("workflow_templates").select("*").eq("id", params.id).single()

    if (error) {
      console.error("Error fetching template:", error)
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    return NextResponse.json(template)
  } catch (error) {
    console.error("Error in POST /api/templates/[id]/download:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
