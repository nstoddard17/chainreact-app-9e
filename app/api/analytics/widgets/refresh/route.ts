import { NextRequest } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { subDays, startOfDay, format, eachDayOfInterval } from "date-fns"

import { logger } from "@/lib/utils/logger"

const WIDGETS_TABLE = "analytics_widgets"
const WIDGET_CACHE_TABLE = "analytics_widget_cache"

type Widget = {
  id: string
  user_id: string
  type: string
  config?: any
}

async function computeWidgetData(supabase: any, widget: Widget) {
  const userId = widget.user_id
  const now = new Date()
  const startDate = subDays(startOfDay(now), 30)

  if (widget.type === "integration_health") {
    const { data: integrations } = await supabase
      .from("integrations")
      .select("id, provider, status, expires_at")
      .eq("user_id", userId)
    return { integrations: integrations || [] }
  }

  if (widget.type === "recent_executions" || widget.type === "top_workflows") {
    const [{ data: executions }, { data: workflows }] = await Promise.all([
      supabase
        .from("workflow_execution_sessions")
        .select("id, workflow_id, status, started_at, completed_at, created_at, error_message")
        .eq("user_id", userId)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("workflows")
        .select("id, name")
        .eq("user_id", userId),
    ])

    const workflowMap = new Map((workflows || []).map((w: any) => [w.id, w]))

    if (widget.type === "recent_executions") {
      const recent = (executions || []).slice(0, 10).map((exec: any) => ({
        id: exec.id,
        workflowId: exec.workflow_id,
        workflowName: workflowMap.get(exec.workflow_id)?.name || "Unknown Workflow",
        status: exec.status,
        startedAt: exec.started_at || exec.created_at,
        completedAt: exec.completed_at,
        durationMs:
          exec.completed_at && (exec.started_at || exec.created_at)
            ? new Date(exec.completed_at).getTime() -
              new Date(exec.started_at || exec.created_at).getTime()
            : null,
        error: exec.error_message,
      }))
      return { recent }
    }

    const grouped = new Map<string, any[]>()
    for (const exec of executions || []) {
      const arr = grouped.get(exec.workflow_id) || []
      arr.push(exec)
      grouped.set(exec.workflow_id, arr)
    }

    const top = Array.from(grouped.entries()).map(([workflowId, execs]) => {
      const total = execs.length
      const successful = execs.filter((e: any) => e.status === "completed").length
      const failed = execs.filter((e: any) => e.status === "failed").length
      const completedWithTime = execs.filter(
        (e: any) => e.status === "completed" && e.completed_at && (e.started_at || e.created_at)
      )
      const totalTimeMs = completedWithTime.reduce((sum: number, e: any) => {
        return sum + (new Date(e.completed_at).getTime() - new Date(e.started_at || e.created_at).getTime())
      }, 0)
      return {
        workflowId,
        workflowName: workflowMap.get(workflowId)?.name || "Unknown Workflow",
        totalExecutions: total,
        successfulExecutions: successful,
        failedExecutions: failed,
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
        avgExecutionTimeMs: completedWithTime.length ? Math.round(totalTimeMs / completedWithTime.length) : 0,
      }
    })
    return { top: top.sort((a, b) => b.totalExecutions - a.totalExecutions).slice(0, 10) }
  }

  if (widget.type === "execution_history") {
    const { data: executions } = await supabase
      .from("workflow_execution_sessions")
      .select("created_at, started_at, completed_at, status")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())

    const days = eachDayOfInterval({ start: startDate, end: startOfDay(now) })
    const dailyStats = days.map((day) => {
      const dayString = format(day, "yyyy-MM-dd")
      const dayExecutions = (executions || []).filter((e: any) => {
        const bucket = e.completed_at || e.started_at || e.created_at
        if (!bucket) return false
        return format(new Date(bucket), "yyyy-MM-dd") === dayString
      })
      return {
        date: dayString,
        dayName: format(day, "EEE"),
        executions: dayExecutions.length,
        successful: dayExecutions.filter((e: any) => e.status === "completed").length,
        failed: dayExecutions.filter((e: any) => e.status === "failed").length,
      }
    })
    return { dailyStats }
  }

  if (widget.type === "total_executions" || widget.type === "success_rate" || widget.type === "failed_executions" || widget.type === "avg_execution_time") {
    const { data: executions } = await supabase
      .from("workflow_execution_sessions")
      .select("status, started_at, completed_at, created_at")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())

    const total = (executions || []).length
    const completed = (executions || []).filter((e: any) => e.status === "completed").length
    const failed = (executions || []).filter((e: any) => e.status === "failed").length
    const completedWithTime = (executions || []).filter(
      (e: any) => e.status === "completed" && e.completed_at && (e.started_at || e.created_at)
    )
    const totalTimeMs = completedWithTime.reduce((sum: number, e: any) => {
      return sum + (new Date(e.completed_at).getTime() - new Date(e.started_at || e.created_at).getTime())
    }, 0)
    const avgExecutionTimeMs = completedWithTime.length ? Math.round(totalTimeMs / completedWithTime.length) : 0
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0

    return { total, completed, failed, avgExecutionTimeMs, successRate }
  }

  return { message: "Custom widget refresh not implemented", config: widget.config || {} }
}

function computeNextRun(schedule: string) {
  const now = new Date()
  switch (schedule) {
    case "daily":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000)
    case "weekly":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    case "bi_weekly":
      return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    case "monthly":
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    default:
      return null
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

    const body = await request.json().catch(() => ({}))
    const widgetId = body.widgetId as string | undefined

    const { data: widgets } = await supabase
      .from(WIDGETS_TABLE)
      .select("*")
      .eq("user_id", user.id)
      .match(widgetId ? { id: widgetId } : {})

    const serviceClient = await createSupabaseServiceClient()
    for (const widget of widgets || []) {
      const data = await computeWidgetData(serviceClient, widget as Widget)
      await serviceClient
        .from(WIDGET_CACHE_TABLE)
        .upsert({
          widget_id: widget.id,
          data,
          refreshed_at: new Date().toISOString(),
        })

      const nextRun = computeNextRun(widget.schedule)
      await serviceClient
        .from(WIDGETS_TABLE)
        .update({
          last_refreshed_at: new Date().toISOString(),
          next_refresh_at: nextRun ? nextRun.toISOString() : null,
        })
        .eq("id", widget.id)
    }

    return jsonResponse({ success: true, refreshed: widgets?.length || 0 })
  } catch (error: any) {
    logger.error("[Analytics Widgets Refresh] Unexpected error", error)
    return errorResponse(error.message || "Failed to refresh widgets", 500)
  }
}
