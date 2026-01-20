import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

/**
 * GET /workflows/v2/api/flows/[flowId]/runs/latest
 * Returns the latest run for a workflow, or null if no runs exist
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ flowId: string }> }
) {
  try {
    const { flowId } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Try to get the latest execution session for this workflow
    const { data: latestRun, error } = await supabase
      .from("workflow_execution_sessions")
      .select("id, status, created_at")
      .eq("workflow_id", flowId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      // Table might not exist - that's OK, return null
      return NextResponse.json({ run: null })
    }

    return NextResponse.json({
      run: latestRun ? { id: latestRun.id } : null
    })
  } catch (error) {
    // Return null for any errors - this endpoint is optional
    return NextResponse.json({ run: null })
  }
}
