import { NextRequest } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { subDays, startOfDay, format, eachDayOfInterval } from "date-fns"
import { logger } from "@/lib/utils/logger"

export const dynamic = "force-dynamic"

interface ExecutionStats {
  total: number
  completed: number
  failed: number
  running: number
  cancelled: number
  successRate: number
  avgExecutionTimeMs: number
}

interface DailyStats {
  date: string
  dayName: string
  executions: number
  successful: number
  failed: number
}

interface WorkflowStats {
  workflowId: string
  workflowName: string
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  lastExecutedAt: string | null
  successRate: number
  avgExecutionTimeMs: number
}

interface RecentExecution {
  id: string
  workflowId: string
  workflowName: string
  status: string
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  error: string | null
}

interface IntegrationStats {
  total: number
  connected: number
  expiring: number
  expired: number
  disconnected: number
}

interface DashboardData {
  overview: ExecutionStats
  dailyStats: DailyStats[]
  topWorkflows: WorkflowStats[]
  recentExecutions: RecentExecution[]
  integrationStats: IntegrationStats
  period: {
    start: string
    end: string
    days: number
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Parse query params for date range
    const searchParams = request.nextUrl.searchParams
    const daysParam = searchParams.get("days")
    const days = daysParam ? parseInt(daysParam, 10) : 30

    const today = startOfDay(new Date())
    const startDate = subDays(today, days - 1)

    logger.debug("[Analytics Dashboard] Fetching data", {
      userId: user.id,
      days,
      startDate: startDate.toISOString(),
    })

    // Fetch all data in parallel for performance
    const [
      executionsResult,
      workflowsResult,
      integrationsResult,
    ] = await Promise.all([
      // Get all executions in date range
      supabase
        .from("workflow_execution_sessions")
        .select("id, workflow_id, status, started_at, completed_at, created_at, error_message")
        .eq("user_id", user.id)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false }),

      // Get all user workflows
      supabase
        .from("workflows")
        .select("id, name, status")
        .eq("user_id", user.id),

      // Get all integrations
      supabase
        .from("integrations")
        .select("id, provider, status, expires_at")
        .eq("user_id", user.id),
    ])

    if (executionsResult.error) {
      logger.error("[Analytics Dashboard] Error fetching executions", {
        error: executionsResult.error,
        code: executionsResult.error.code,
        message: executionsResult.error.message,
        details: executionsResult.error.details,
        hint: executionsResult.error.hint,
      })
      return errorResponse(`Failed to fetch execution data: ${executionsResult.error.message}`, 500)
    }

    if (workflowsResult.error) {
      logger.error("[Analytics Dashboard] Error fetching workflows", {
        error: workflowsResult.error,
        code: workflowsResult.error.code,
        message: workflowsResult.error.message,
      })
    }

    if (integrationsResult.error) {
      logger.error("[Analytics Dashboard] Error fetching integrations", {
        error: integrationsResult.error,
        code: integrationsResult.error.code,
        message: integrationsResult.error.message,
      })
    }

    const executions = executionsResult.data || []
    const workflows = workflowsResult.data || []
    const integrations = integrationsResult.data || []


    // Create workflow lookup map
    const workflowMap = new Map(workflows.map((w) => [w.id, w]))

    // Use all executions (test mode filter removed as column may not exist)
    const productionExecutions = executions

    // Calculate overview stats
    const overview = calculateOverviewStats(productionExecutions)

    // Calculate daily stats
    const dailyStats = calculateDailyStats(productionExecutions, startDate, today)

    // Calculate per-workflow stats
    const topWorkflows = calculateWorkflowStats(productionExecutions, workflowMap)

    // Get recent executions (last 10)
    const recentExecutions = productionExecutions.slice(0, 10).map((exec) => {
      const workflow = workflowMap.get(exec.workflow_id)
      const startedAt = exec.started_at || exec.created_at
      const durationMs =
        exec.completed_at && startedAt
          ? new Date(exec.completed_at).getTime() - new Date(startedAt).getTime()
          : null

      return {
        id: exec.id,
        workflowId: exec.workflow_id,
        workflowName: workflow?.name || "Unknown Workflow",
        status: exec.status,
        startedAt,
        completedAt: exec.completed_at,
        durationMs,
        error: exec.error_message,
      }
    })

    // Calculate integration stats
    const integrationStats = calculateIntegrationStats(integrations)

    const dashboardData: DashboardData = {
      overview,
      dailyStats,
      topWorkflows,
      recentExecutions,
      integrationStats,
      period: {
        start: startDate.toISOString(),
        end: today.toISOString(),
        days,
      },
    }

    logger.debug("[Analytics Dashboard] Data fetched successfully", {
      executionCount: productionExecutions.length,
      workflowCount: workflows.length,
      integrationCount: integrations.length,
    })

    return jsonResponse(dashboardData)
  } catch (error: any) {
    logger.error("[Analytics Dashboard] Unexpected error", error)
    return errorResponse(error.message || "Failed to fetch analytics", 500)
  }
}

function calculateOverviewStats(executions: any[]): ExecutionStats {
  const total = executions.length
  const completed = executions.filter((e) => e.status === "completed").length
  const failed = executions.filter((e) => e.status === "failed").length
  const running = executions.filter((e) => e.status === "running").length
  const cancelled = executions.filter((e) => e.status === "cancelled").length

  const successRate = total > 0 ? Math.round((completed / total) * 100 * 10) / 10 : 0

  // Calculate average execution time for completed executions
    const completedWithTime = executions.filter(
    (e) => e.status === "completed" && e.completed_at && (e.started_at || e.created_at)
  )
  const totalTimeMs = completedWithTime.reduce((sum, e) => {
    const startedAt = e.started_at || e.created_at
    return sum + (new Date(e.completed_at).getTime() - new Date(startedAt).getTime())
  }, 0)
  const avgExecutionTimeMs =
    completedWithTime.length > 0 ? Math.round(totalTimeMs / completedWithTime.length) : 0

  return {
    total,
    completed,
    failed,
    running,
    cancelled,
    successRate,
    avgExecutionTimeMs,
  }
}

function calculateDailyStats(executions: any[], startDate: Date, endDate: Date): DailyStats[] {
  const days = eachDayOfInterval({ start: startDate, end: endDate })

  return days.map((day) => {
    const dayString = format(day, "yyyy-MM-dd")
    const dayName = format(day, "EEE") // Mon, Tue, etc.

    const dayExecutions = executions.filter((e) => {
      const execStart = e.started_at || e.created_at
      if (!execStart) return false
      const execDate = format(new Date(execStart), "yyyy-MM-dd")
      return execDate === dayString
    })

    const successful = dayExecutions.filter((e) => e.status === "completed").length
    const failed = dayExecutions.filter((e) => e.status === "failed").length

    return {
      date: dayString,
      dayName,
      executions: dayExecutions.length,
      successful,
      failed,
    }
  })
}

function calculateWorkflowStats(
  executions: any[],
  workflowMap: Map<string, any>
): WorkflowStats[] {
  // Group executions by workflow
  const workflowExecutions = new Map<string, any[]>()

  for (const exec of executions) {
    const existing = workflowExecutions.get(exec.workflow_id) || []
    existing.push(exec)
    workflowExecutions.set(exec.workflow_id, existing)
  }

  // Calculate stats for each workflow
  const stats: WorkflowStats[] = []

  for (const [workflowId, execs] of workflowExecutions) {
    const workflow = workflowMap.get(workflowId)
    if (!workflow) continue

    const totalExecutions = execs.length
    const successfulExecutions = execs.filter((e) => e.status === "completed").length
    const failedExecutions = execs.filter((e) => e.status === "failed").length

    // Find last execution
    const sortedExecs = [...execs].sort((a, b) => {
      const aTime = new Date(a.started_at || a.created_at || 0).getTime()
      const bTime = new Date(b.started_at || b.created_at || 0).getTime()
      return bTime - aTime
    })
    const lastExecutedAt = sortedExecs[0]?.started_at || sortedExecs[0]?.created_at || null

    // Calculate success rate
    const successRate =
      totalExecutions > 0
        ? Math.round((successfulExecutions / totalExecutions) * 100 * 10) / 10
        : 0

    // Calculate average execution time
    const completedWithTime = execs.filter(
      (e) => e.status === "completed" && e.completed_at && (e.started_at || e.created_at)
    )
    const totalTimeMs = completedWithTime.reduce((sum, e) => {
      const startedAt = e.started_at || e.created_at
      return sum + (new Date(e.completed_at).getTime() - new Date(startedAt).getTime())
    }, 0)
    const avgExecutionTimeMs =
      completedWithTime.length > 0 ? Math.round(totalTimeMs / completedWithTime.length) : 0

    stats.push({
      workflowId,
      workflowName: workflow.name,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      lastExecutedAt,
      successRate,
      avgExecutionTimeMs,
    })
  }

  // Sort by total executions descending and take top 10
  return stats.sort((a, b) => b.totalExecutions - a.totalExecutions).slice(0, 10)
}

function calculateIntegrationStats(integrations: any[]): IntegrationStats {
  const now = new Date()
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  // Filter out internal integrations
  const externalIntegrations = integrations.filter(
    (i) => !["logic", "ai", "llm"].includes(i.provider)
  )

  const total = externalIntegrations.length
  const connected = externalIntegrations.filter((i) => i.status === "connected").length
  const disconnected = externalIntegrations.filter((i) => i.status === "disconnected").length

  // Check for expiring/expired tokens
  let expiring = 0
  let expired = 0

  for (const integration of externalIntegrations) {
    if (integration.expires_at) {
      const expiryDate = new Date(integration.expires_at)
      if (expiryDate < now) {
        expired++
      } else if (expiryDate < threeDaysFromNow) {
        expiring++
      }
    }
  }

  return {
    total,
    connected,
    expiring,
    expired,
    disconnected,
  }
}

