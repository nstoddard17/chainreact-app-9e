import { NextRequest } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"

import { logger } from "@/lib/utils/logger"

const DASHBOARDS_TABLE = "analytics_dashboards"
const WIDGETS_TABLE = "analytics_widgets"
const WIDGET_CACHE_TABLE = "analytics_widget_cache"

type WidgetType =
  | "total_executions"
  | "success_rate"
  | "failed_executions"
  | "avg_execution_time"
  | "execution_history"
  | "top_workflows"
  | "recent_executions"
  | "integration_health"
  | "custom"

const DEFAULT_WIDGETS: Array<{
  type: WidgetType
  title: string
}> = [
  { type: "total_executions", title: "Total Executions" },
  { type: "success_rate", title: "Success Rate" },
  { type: "failed_executions", title: "Failed Executions" },
  { type: "avg_execution_time", title: "Avg. Execution Time" },
  { type: "execution_history", title: "Execution History" },
  { type: "integration_health", title: "Integration Health" },
  { type: "top_workflows", title: "Top Workflows" },
  { type: "recent_executions", title: "Recent Executions" },
]


function buildDefaultLayout(widgetIds: string[]) {
  const rows = [
    {
      id: "row_metrics",
      slots: [
        { slotId: "row_metrics:slot_1", widgetId: widgetIds[0] || null, size: "small" },
        { slotId: "row_metrics:slot_2", widgetId: widgetIds[1] || null, size: "small" },
        { slotId: "row_metrics:slot_3", widgetId: widgetIds[2] || null, size: "small" },
        { slotId: "row_metrics:slot_4", widgetId: widgetIds[3] || null, size: "small" },
      ],
    },
    {
      id: "row_history",
      slots: [
        { slotId: "row_history:slot_1", widgetId: widgetIds[4] || null, size: "wide" },
        { slotId: "row_history:slot_2", widgetId: widgetIds[5] || null, size: "medium" },
      ],
    },
    {
      id: "row_recent",
      slots: [
        { slotId: "row_recent:slot_1", widgetId: widgetIds[6] || null, size: "large" },
        { slotId: "row_recent:slot_2", widgetId: widgetIds[7] || null, size: "large" },
      ],
    },
  ]

  return { rows }
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const { data: dashboard } = await supabase
      .from(DASHBOARDS_TABLE)
      .select("id, layout")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!dashboard) {
      const widgetRows = DEFAULT_WIDGETS.map((preset) => ({
        id: crypto.randomUUID(),
        user_id: user.id,
        type: preset.type,
        title: preset.title,
        config: {},
        schedule: "on_demand",
      }))

      const layout = buildDefaultLayout(widgetRows.map((w) => w.id))

      const { error: insertDashboardError } = await supabase
        .from(DASHBOARDS_TABLE)
        .insert({
          user_id: user.id,
          layout,
        })

      if (insertDashboardError) {
        logger.error("[Analytics Widgets] Failed to create dashboard", insertDashboardError)
        return errorResponse("Failed to create dashboard", 500)
      }

      const { error: insertWidgetsError } = await supabase
        .from(WIDGETS_TABLE)
        .insert(widgetRows)

      if (insertWidgetsError) {
        logger.error("[Analytics Widgets] Failed to create default widgets", insertWidgetsError)
        return errorResponse("Failed to create default widgets", 500)
      }

      return jsonResponse({ widgets: widgetRows, layout })
    }

    const { data: widgets, error: widgetsError } = await supabase
      .from(WIDGETS_TABLE)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (widgetsError) {
      logger.error("[Analytics Widgets] Failed to fetch widgets", widgetsError)
      return errorResponse("Failed to fetch widgets", 500)
    }

    const widgetIds = (widgets || []).map((w) => w.id)
    const { data: caches } = widgetIds.length
      ? await supabase
          .from(WIDGET_CACHE_TABLE)
          .select("widget_id, data, refreshed_at")
          .in("widget_id", widgetIds)
      : { data: [] }

    const cacheMap = new Map((caches || []).map((c: any) => [c.widget_id, c]))

    const enriched = (widgets || []).map((w) => ({
      ...w,
      cache: cacheMap.get(w.id) || null,
    }))

    return jsonResponse({
      widgets: enriched,
      layout: dashboard.layout || [],
    })
  } catch (error: any) {
    logger.error("[Analytics Widgets] Unexpected error", error)
    return errorResponse(error.message || "Failed to load widgets", 500)
  }
}

export async function POST(request: NextRequest) {
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
    const widget = {
      id: crypto.randomUUID(),
      user_id: user.id,
      type: body.type,
      title: body.title,
      config: body.config || {},
      schedule: body.schedule || "on_demand",
    }

    const { error } = await supabase.from(WIDGETS_TABLE).insert(widget)
    if (error) {
      logger.error("[Analytics Widgets] Failed to create widget", error)
      return errorResponse("Failed to create widget", 500)
    }

    return jsonResponse(widget)
  } catch (error: any) {
    logger.error("[Analytics Widgets] Unexpected error", error)
    return errorResponse(error.message || "Failed to create widget", 500)
  }
}

export async function PUT(request: NextRequest) {
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
    if (!body.layout) {
      return errorResponse("Missing layout", 400)
    }

    const { error } = await supabase
      .from(DASHBOARDS_TABLE)
      .update({ layout: body.layout })
      .eq("user_id", user.id)

    if (error) {
      logger.error("[Analytics Widgets] Failed to update layout", error)
      return errorResponse("Failed to update layout", 500)
    }

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error("[Analytics Widgets] Unexpected error", error)
    return errorResponse(error.message || "Failed to update layout", 500)
  }
}
