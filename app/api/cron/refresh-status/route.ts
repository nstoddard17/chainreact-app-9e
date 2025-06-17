import { type NextRequest, NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    // Check for authentication
    const authHeader = request.headers.get("authorization")
    const url = new URL(request.url)
    const querySecret = url.searchParams.get("secret") || url.searchParams.get("cron_secret")
    const jobId = url.searchParams.get("jobId")

    const expectedSecret = process.env.CRON_SECRET

    if (!expectedSecret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }

    // Check authorization from header or query parameter
    const providedSecret = authHeader?.replace("Bearer ", "") || querySecret

    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId parameter" }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    // Get job status using the function we created
    const { data, error } = await supabase.rpc("get_refresh_job_status", { p_job_id: jobId })

    if (error) {
      return NextResponse.json({ error: `Failed to get job status: ${error.message}` }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      job: data[0],
    })
  } catch (error: any) {
    console.error("Error checking job status:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to check job status",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
