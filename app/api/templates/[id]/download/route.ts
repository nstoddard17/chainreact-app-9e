import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const body = await request.json()
    const { organization_id } = body

    // Record the download
    const { error: downloadError } = await supabase.from("template_downloads").insert({
      template_id: params.id,
      user_id: user.id,
      organization_id: organization_id || null,
    })

    if (downloadError) {
      logger.error("Error recording download:", downloadError)
      return errorResponse("Failed to record download" , 500)
    }

    // Get the template data
    const { data: template, error } = await supabase.from("workflows_templates").select("*").eq("id", params.id).single()

    if (error) {
      logger.error("Error fetching template:", error)
      return errorResponse("Template not found" , 404)
    }

    return jsonResponse(template)
  } catch (error) {
    logger.error("Error in POST /api/templates/[id]/download:", error)
    return errorResponse("Internal server error" , 500)
  }
}
