import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

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
      return errorResponse("CRON_SECRET not configured" , 500)
    }

    // Check authorization from header or query parameter
    const providedSecret = authHeader?.replace("Bearer ", "") || querySecret

    if (!providedSecret || providedSecret !== expectedSecret) {
      return errorResponse("Unauthorized" , 401)
    }

    if (!jobId) {
      return errorResponse("Missing jobId parameter" , 400)
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return errorResponse("Failed to create database client" , 500)
    }

    // Get job status using the function we created
    const { data, error } = await supabase.rpc("get_refresh_job_status", { p_job_id: jobId })

    if (error) {
      return jsonResponse({ error: `Failed to get job status: ${error.message}` }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return errorResponse("Job not found" , 404)
    }

    return jsonResponse({
      success: true,
      job: data[0],
    })
  } catch (error: any) {
    logger.error("Error checking job status:", error)
    return jsonResponse(
      {
        success: false,
        error: "Failed to check job status",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
