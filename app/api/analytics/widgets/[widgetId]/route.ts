import { NextRequest } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"

import { logger } from "@/lib/utils/logger"

const WIDGETS_TABLE = "analytics_widgets"

export async function PUT(request: NextRequest, { params }: { params: { widgetId: string } }) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()

    const { error } = await supabase
      .from(WIDGETS_TABLE)
      .update({
        title: body.title,
        config: body.config,
        schedule: body.schedule,
      })
      .eq("id", params.widgetId)
      .eq("user_id", user.id)

    if (error) {
      logger.error("[Analytics Widgets] Failed to update widget", error)
      return errorResponse("Failed to update widget", 500)
    }

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error("[Analytics Widgets] Unexpected error", error)
    return errorResponse(error.message || "Failed to update widget", 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { widgetId: string } }) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const { error } = await supabase
      .from(WIDGETS_TABLE)
      .delete()
      .eq("id", params.widgetId)
      .eq("user_id", user.id)

    if (error) {
      logger.error("[Analytics Widgets] Failed to delete widget", error)
      return errorResponse("Failed to delete widget", 500)
    }

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error("[Analytics Widgets] Unexpected error", error)
    return errorResponse(error.message || "Failed to delete widget", 500)
  }
}
