"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TrendingUp,
  TrendingDown,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  AlertCircle,
  RefreshCw,
  BarChart3,
  Workflow,
  Link2,
  Calendar,
  Plus,
  Settings,
  X,
} from "lucide-react"
import { useAnalyticsStore } from "@/stores/analyticsStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { formatDistanceToNow, format } from "date-fns"
import Link from "next/link"
// Fixed slot layout (no freeform drag)

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "-"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  loading,
  size = "large",
}: {
  title: string
  value: string | number
  icon: React.ElementType
  description?: string
  trend?: { direction: "up" | "down" | "neutral"; value: string }
  loading?: boolean
  size?: "small" | "medium" | "large"
}) {
  const compact = size === "small"
  const paddingClass = compact ? "p-4" : "p-6"
  const titleClass = compact ? "text-xs" : "text-sm"
  const valueClass = compact ? "text-xl" : "text-2xl"

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className={`${paddingClass} h-full`}>
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <Skeleton className="w-16 h-4" />
          </div>
          <Skeleton className="w-20 h-8 mb-1" />
          <Skeleton className="w-24 h-4" />
        </CardContent>
      </Card>
    )
  }

  const getTrendColor = () => {
    if (!trend) return ""
    if (trend.direction === "up") return "text-green-600 dark:text-green-400"
    if (trend.direction === "down") return "text-red-600 dark:text-red-400"
    return "text-muted-foreground"
  }

  const TrendIcon = trend?.direction === "up" ? TrendingUp : TrendingDown

  return (
    <Card className="h-full">
      <CardContent className={`${paddingClass} h-full`}>
        <div className="flex items-center justify-between mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-sm ${getTrendColor()}`}>
              <TrendIcon className="w-4 h-4" />
              <span>{trend.value}</span>
            </div>
          )}
        </div>
        <h3 className={`${valueClass} font-bold mb-1`}>{value}</h3>
        <p className={`${titleClass} text-muted-foreground`}>{title}</p>
        {!compact && description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

function ExecutionChart({
  dailyStats,
  loading,
  size = "large",
}: {
  dailyStats: any[]
  loading: boolean
  size?: "small" | "medium" | "large"
}) {
  if (loading) {
    return (
      <Card className="col-span-full h-full">
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
          <CardDescription>Daily workflow executions</CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          <div className="flex items-end gap-1 h-48">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="flex-1 h-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = dailyStats.slice(-7)
  const maxExecutions = Math.max(...chartData.map((d) => Number(d.executions) || 0), 1)
  const isSmall = size === "small"

  return (
    <Card className="col-span-full h-full flex flex-col">
      {!isSmall && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Execution History
              </CardTitle>
              <CardDescription>Daily workflow executions (last 7 days)</CardDescription>
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className="flex-1 min-h-0 flex flex-col">
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Activity className="w-12 h-12 mb-2 opacity-50" />
            <p>No execution data yet</p>
            {!isSmall && <p className="text-sm">Run some workflows to see analytics here</p>}
          </div>
        ) : (
          <div
            className={`grid grid-cols-7 gap-2 flex-1 min-h-0 ${
              isSmall ? "min-h-[140px]" : size === "medium" ? "min-h-[170px]" : "min-h-[230px]"
            }`}
          >
            {chartData.map((day, i) => {
              const executions = Number(day.executions) || 0
              const successfulRaw = Number(day.successful ?? day.completed ?? day.success) || 0
              const failedRaw = Number(day.failed ?? day.errors ?? day.error) || 0
              const successful = Math.max(0, Math.min(executions, successfulRaw))
              const failed = Math.max(0, Math.min(executions - successful, failedRaw))
              const other = Math.max(0, executions - successful - failed)

              const totalHeight = maxExecutions > 0 ? (executions / maxExecutions) * 100 : 0
              const successHeight = executions > 0 ? (successful / executions) * totalHeight : 0
              const failedHeight = executions > 0 ? (failed / executions) * totalHeight : 0
              const otherHeight = Math.max(0, totalHeight - successHeight - failedHeight)

              return (
                <div key={`${day.date || day.dayName || "day"}-${i}`} className="h-full flex flex-col justify-end min-h-0">
                  <div className="w-full h-full flex flex-col justify-end rounded-t-sm overflow-hidden bg-muted/20">
                    {other > 0 && (
                      <div
                        className="w-full bg-slate-400/60 dark:bg-slate-500/60 transition-all"
                        style={{ height: `${otherHeight}%`, minHeight: "2px" }}
                        title={`${other} other`}
                      />
                    )}
                    {failed > 0 && (
                      <div
                        className="w-full bg-red-500/80 dark:bg-red-600/80 transition-all"
                        style={{ height: `${failedHeight}%`, minHeight: "2px" }}
                        title={`${failed} failed`}
                      />
                    )}
                    {successful > 0 && (
                      <div
                        className="w-full bg-green-500/80 dark:bg-green-600/80 transition-all"
                        style={{ height: `${successHeight}%`, minHeight: "2px" }}
                        title={`${successful} successful`}
                      />
                    )}
                  </div>
                  <div className={`mt-1 text-center text-muted-foreground ${isSmall ? "text-[10px]" : "text-xs"}`}>{day.dayName}</div>
                  <div className={`text-center font-medium ${isSmall ? "text-[10px]" : "text-xs"}`}>{executions}</div>
                </div>
              )
            })}
          </div>
        )}
        <div className={`flex items-center justify-center gap-4 mt-3 ${isSmall ? "text-xs" : "text-sm"}`}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-green-500/80" />
            <span className="text-muted-foreground">Successful</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-red-500/80" />
            <span className="text-muted-foreground">Failed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-slate-400/60" />
            <span className="text-muted-foreground">Other</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TopWorkflows({
  workflows,
  loading,
  size = "large",
}: {
  workflows: any[]
  loading: boolean
  size?: "small" | "medium" | "large"
}) {
  if (loading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle>Top Workflows</CardTitle>
          <CardDescription>Most executed workflows</CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="w-40 h-4" />
                <Skeleton className="w-20 h-4" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const maxItems = size === "small" ? 3 : size === "medium" ? 4 : 5

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Workflow className="w-5 h-5" />
          Top Workflows
        </CardTitle>
        <CardDescription>Most executed workflows in this period</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Workflow className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">No workflows executed yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {workflows.slice(0, maxItems).map((workflow, i) => (
              <div key={workflow.workflowId} className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/workflows/builder/${workflow.workflowId}`}
                      className="font-medium truncate block hover:text-primary transition-colors"
                    >
                      {workflow.workflowName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {workflow.totalExecutions} executions
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      workflow.successRate >= 90
                        ? "border-green-500/50 text-green-600 dark:text-green-400"
                        : workflow.successRate >= 70
                          ? "border-yellow-500/50 text-yellow-600 dark:text-yellow-400"
                          : "border-red-500/50 text-red-600 dark:text-red-400"
                    }
                  >
                    {workflow.successRate}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RecentExecutions({
  executions,
  loading,
  size = "large",
}: {
  executions: any[]
  loading: boolean
  size?: "small" | "medium" | "large"
}) {
  if (loading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle>Recent Executions</CardTitle>
          <CardDescription>Latest workflow runs</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto min-h-0">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b last:border-b-0">
                <Skeleton className="w-40 h-4" />
                <Skeleton className="w-24 h-6" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Success
          </Badge>
        )
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        )
      case "running":
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Running
          </Badge>
        )
      case "cancelled":
        return (
          <Badge variant="secondary">
            <XCircle className="w-3 h-3 mr-1" />
            Cancelled
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const maxItems = size === "small" ? 4 : size === "medium" ? 6 : 10

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Recent Executions
        </CardTitle>
        <CardDescription>Latest workflow runs</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto min-h-0">
        {executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Activity className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">No recent executions</p>
            <p className="text-xs">Execute a workflow to see it here</p>
          </div>
        ) : (
          <div className="space-y-1">
            {executions.slice(0, maxItems).map((exec) => (
              <div
                key={exec.id}
                className="flex items-center justify-between py-3 border-b last:border-b-0"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      exec.status === "completed"
                        ? "bg-green-500"
                        : exec.status === "failed"
                          ? "bg-red-500"
                          : exec.status === "running"
                            ? "bg-blue-500 animate-pulse"
                            : "bg-gray-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/workflows/builder/${exec.workflowId}`}
                      className="font-medium truncate block hover:text-primary transition-colors"
                    >
                      {exec.workflowName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(exec.startedAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {exec.durationMs !== null && (
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatDuration(exec.durationMs)}
                    </Badge>
                  )}
                  {getStatusBadge(exec.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function IntegrationHealth({
  stats,
  loading,
}: {
  stats: any
  loading: boolean
}) {
  if (loading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle>Integration Health</CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          <Skeleton className="w-full h-24" />
        </CardContent>
      </Card>
    )
  }

  const { connected, expiring, expired, disconnected, total } = stats

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="w-5 h-5" />
          Integration Health
        </CardTitle>
        <CardDescription>Status of your connected apps</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <Link2 className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">No integrations connected</p>
            <Link href="/apps">
              <Button variant="outline" size="sm" className="mt-2">
                Connect Apps
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {connected}
                </div>
                <div className="text-xs text-muted-foreground">Connected</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="text-2xl font-bold">{total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>

            {(expiring > 0 || expired > 0 || disconnected > 0) && (
              <div className="space-y-2">
                {expired > 0 && (
                  <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      <span>{expired} expired</span>
                    </div>
                    <Link href="/apps">
                      <Button variant="ghost" size="sm" className="text-red-600 h-auto p-1">
                        Fix
                      </Button>
                    </Link>
                  </div>
                )}
                {expiring > 0 && (
                  <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                    <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                      <Clock className="w-4 h-4" />
                      <span>{expiring} expiring soon</span>
                    </div>
                    <Link href="/apps">
                      <Button variant="ghost" size="sm" className="text-yellow-600 h-auto p-1">
                        Refresh
                      </Button>
                    </Link>
                  </div>
                )}
                {disconnected > 0 && (
                  <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <XCircle className="w-4 h-4" />
                      <span>{disconnected} disconnected</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const SIZE_OPTIONS = [
  { value: "small", label: "Small", w: 3, h: 2 },
  { value: "medium", label: "Medium", w: 4, h: 3 },
  { value: "large", label: "Large", w: 6, h: 4 },
  { value: "wide", label: "Wide", w: 8, h: 4 },
  { value: "full", label: "Full", w: 12, h: 4 },
]

const DEFAULT_ROWS = [{ id: "row_default" }]

type DashboardRow = {
  id: string
  slots: Array<{ slotId: string; widgetId: string | null; size: string }>
}

function sanitizeLayout(rows: DashboardRow[]): DashboardRow[] {
  return rows.map((row) => {
    const seen = new Set<string>()
    const slots = row.slots.map((slot) => {
      const requestedId = slot.slotId || `${row.id}:slot`
      if (!seen.has(requestedId)) {
        seen.add(requestedId)
        return slot
      }
      const uniqueId = `${row.id}:slot_${crypto.randomUUID().slice(0, 8)}`
      seen.add(uniqueId)
      return { ...slot, slotId: uniqueId }
    })
    return { ...row, slots }
  })
}

function buildRows(rows: Array<{ id: string }>): DashboardRow[] {
  return rows.map((row) => ({
    id: row.id,
    slots: [],
  }))
}

function normalizeLayout(rawLayout: any, widgets: any[]): DashboardRow[] {
  if (!rawLayout || rawLayout.length === 0) {
    return sanitizeLayout(buildRows(DEFAULT_ROWS))
  }

  if (rawLayout.rows && Array.isArray(rawLayout.rows)) {
    return sanitizeLayout(rawLayout.rows as DashboardRow[])
  }

  if (Array.isArray(rawLayout) && rawLayout.some((item) => "slotId" in item)) {
    const rows = buildRows(DEFAULT_ROWS)
    const widgetIds = widgets.map((w) => w.id)
    if (rows[0]) {
      rows[0].slots = widgetIds.map((id, index) => ({
        slotId: `${rows[0].id}:slot_${index + 1}`,
        widgetId: id,
        size: "small",
      }))
    }
    return sanitizeLayout(rows)
  }

  return sanitizeLayout(buildRows(DEFAULT_ROWS))
}

export function AnalyticsContent() {
  const {
    dashboard,
    dashboardLoading,
    dashboardError,
    selectedPeriod,
    fetchDashboard,
    setSelectedPeriod,
  } = useAnalyticsStore()
  const { integrations, fetchIntegrations } = useIntegrationStore()
  const [widgets, setWidgets] = useState<any[]>([])
  const [layout, setLayout] = useState<DashboardRow[]>([])
  const [loadingWidgets, setLoadingWidgets] = useState(true)
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [pendingRowId, setPendingRowId] = useState<string | null>(null)
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null)
  const [pendingSlotSize, setPendingSlotSize] = useState<string>("small")
  const [pendingMaxCols, setPendingMaxCols] = useState<number | null>(null)
  const [savingLayout, setSavingLayout] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  useEffect(() => {
    const loadWidgets = async () => {
      setLoadingWidgets(true)
      try {
        const res = await fetch("/api/analytics/widgets")
        const data = await res.json()
        const loadedWidgets = data.widgets || []
        const loadedLayout = normalizeLayout(data.layout || [], loadedWidgets)
        setWidgets(loadedWidgets)
        setLayout(loadedLayout)
      } catch (error) {
        console.error("Failed to load widgets", error)
      } finally {
        setLoadingWidgets(false)
      }
    }

    loadWidgets()
  }, [])

  const persistLayout = (nextLayout: DashboardRow[]) => {
    const normalizedLayout = sanitizeLayout(nextLayout)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(async () => {
      setSavingLayout(true)
      try {
        await fetch("/api/analytics/widgets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout: { rows: normalizedLayout } }),
        })
      } finally {
        setSavingLayout(false)
      }
    }, 500)
  }

  const handleRemoveWidget = async (widgetId: string) => {
    await fetch(`/api/analytics/widgets/${widgetId}`, { method: "DELETE" })
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId))
    setLayout((prev) => {
      const next = prev.map((row) => ({
        ...row,
        slots: row.slots.filter((slot) => slot.widgetId !== widgetId),
      }))
      persistLayout(next)
      return next
    })
  }

  const moveWidgetToSlot = (widgetId: string, targetSlotId: string) => {
    setLayout((prev) => {
      let sourceSlotId: string | null = null
      prev.forEach((row) => {
        row.slots.forEach((slot) => {
          if (slot.widgetId === widgetId) sourceSlotId = slot.slotId
        })
      })
      const sourceSlot = sourceSlotId
      if (!sourceSlot || sourceSlot === targetSlotId) {
        return prev
      }
      let targetWidgetId: string | null = null
      prev.forEach((row) => {
        row.slots.forEach((slot) => {
          if (slot.slotId === targetSlotId) targetWidgetId = slot.widgetId
        })
      })
      const next = prev.map((row) => ({
        ...row,
        slots: row.slots.map((slot) => {
          if (slot.slotId === sourceSlot) {
            return { ...slot, widgetId: targetWidgetId }
          }
          if (slot.slotId === targetSlotId) {
            return { ...slot, widgetId: widgetId }
          }
          return slot
        }),
      }))
      persistLayout(next)
      return next
    })
  }

  const reorderWidgetInRow = (rowId: string, sourceSlotId: string, targetSlotId: string) => {
    if (sourceSlotId === targetSlotId) return
    setLayout((prev) => {
      const next = prev.map((row) => {
        if (row.id !== rowId) return row
        const slots = [...row.slots]
        const fromIndex = slots.findIndex((slot) => slot.slotId === sourceSlotId)
        const toIndex = slots.findIndex((slot) => slot.slotId === targetSlotId)
        if (fromIndex === -1 || toIndex === -1) return row
        const [moved] = slots.splice(fromIndex, 1)
        slots.splice(toIndex, 0, moved)
        return { ...row, slots }
      })
      persistLayout(next)
      return next
    })
  }

  const handleAddWidget = async (widget: any, selectedSize?: string) => {
    const res = await fetch("/api/analytics/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(widget),
    })
    const created = await res.json()
    setWidgets((prev) => [...prev, created])
    setLayout((prev) => {
      const targetRowId = pendingRowId || prev[0]?.id || null
      if (!targetRowId) return prev
      const desiredSize = selectedSize || pendingSlotSize
      const sizeOption = SIZE_OPTIONS.find((opt) => opt.value === desiredSize) || SIZE_OPTIONS[0]
      const remainingCols =
        pendingMaxCols ?? 12
      const allowed = SIZE_OPTIONS.filter((opt) => opt.w <= remainingCols)
      const finalSize = allowed.find((opt) => opt.value === sizeOption.value) || allowed[0] || SIZE_OPTIONS[0]
      const next = prev.map((row) => {
        if (row.id !== targetRowId) return row
        if (pendingSlotId) {
          const slots = row.slots.map((slot) =>
            slot.slotId === pendingSlotId
              ? { ...slot, widgetId: created.id, size: finalSize.value }
              : slot
          )
          return { ...row, slots }
        }
        const nextSlot = {
          slotId: `${row.id}:slot_${crypto.randomUUID().slice(0, 8)}`,
          widgetId: created.id,
          size: finalSize.value,
        }
        return { ...row, slots: [...row.slots, nextSlot] }
      })
      persistLayout(next)
      return next
    })
    setShowAddWidget(false)
    setPendingRowId(null)
    setPendingSlotId(null)
    setPendingMaxCols(null)
  }

  const addRow = () => {
    setLayout((prev) => {
      const nextRow: DashboardRow = {
        id: `row_${crypto.randomUUID().slice(0, 8)}`,
        slots: [],
      }
      const next = [...prev, nextRow]
      persistLayout(next)
      return next
    })
  }

  const removeRow = (rowId: string) => {
    setLayout((prev) => {
      const next = prev.filter((row) => row.id !== rowId)
      persistLayout(next)
      return next
    })
  }

  const overview = dashboard?.overview
  const dailyStats = dashboard?.dailyStats || []
  const topWorkflows = dashboard?.topWorkflows || []
  const recentExecutions = dashboard?.recentExecutions || []
  const integrationStats = dashboard?.integrationStats || {
    total: 0,
    connected: 0,
    expiring: 0,
    expired: 0,
    disconnected: 0,
  }

  // Note: Page-level access control is handled by PageAccessGuard in the page component
  return (
    <div className="space-y-6 pb-8">
      {/* Header with period selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <Select
            value={selectedPeriod.toString()}
            onValueChange={(value) => setSelectedPeriod(parseInt(value, 10))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboard()}
            disabled={dashboardLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${dashboardLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant={editMode ? "secondary" : "default"}
            onClick={() => setEditMode((prev) => !prev)}
          >
            {editMode ? "Done" : "Edit"}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {dashboardError && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="p-4 flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span>{dashboardError}</span>
            <Button variant="outline" size="sm" onClick={() => fetchDashboard()} className="ml-auto">
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loadingWidgets ? (
        <Card>
          <CardContent className="p-6 flex items-center gap-3">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Loading dashboard widgets...</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {layout.map((row) => {
            const widgetSlots = row.slots.filter((slot) => slot.widgetId)
            const usedCols = widgetSlots.reduce((sum, s) => {
              const opt = SIZE_OPTIONS.find((o) => o.value === s.size) || SIZE_OPTIONS[0]
              return sum + opt.w
            }, 0)
            const remainingCols = Math.max(0, 12 - usedCols)
            const minCols = Math.min(...SIZE_OPTIONS.map((option) => option.w))
            const canAddInRow = editMode && remainingCols >= minCols
            return (
              <div key={row.id} className="space-y-3">
                {editMode && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div>Row</div>
                    <div className="flex items-center gap-2">
                      {canAddInRow && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPendingRowId(row.id)
                            setPendingSlotId(null)
                            setPendingMaxCols(remainingCols)
                            setPendingSlotSize(
                              (SIZE_OPTIONS.filter((o) => o.w <= remainingCols).slice(-1)[0]?.value) ||
                                "small"
                            )
                            setShowAddWidget(true)
                          }}
                        >
                          Add Widget
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => removeRow(row.id)}>
                        Remove Row
                      </Button>
                    </div>
                  </div>
                )}
                <div
                  className={
                    editMode
                      ? "border-2 border-dashed border-muted-foreground/30 rounded-lg p-4"
                      : ""
                  }
                >
                  <div className="grid grid-cols-12 gap-x-4 gap-y-4 auto-rows-[130px]">
                  {widgetSlots.length === 0 && editMode ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingRowId(row.id)
                        setPendingSlotId(null)
                        setPendingMaxCols(12)
                        setPendingSlotSize("small")
                        setShowAddWidget(true)
                      }}
                      className="h-full w-full border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition col-span-12"
                    >
                      <Plus className="w-6 h-6 mb-2" />
                      <div className="text-sm font-medium">Add Widget</div>
                    </button>
                  ) : (
                    widgetSlots.map((slot) => {
                      const widgetId = slot.widgetId
                      const widget = widgetId ? widgets.find((w) => w.id === widgetId) : null
                      const sizeOption =
                        SIZE_OPTIONS.find((opt) => opt.value === slot.size) || SIZE_OPTIONS[0]
                      const size =
                        sizeOption.h <= 2 ? "small" : sizeOption.h <= 4 ? "medium" : "large"
                      if (!widget) return null
                      return (
                        <div
                          key={slot.slotId}
                          style={{
                            gridColumnEnd: `span ${sizeOption.w}`,
                            gridRowEnd: `span ${sizeOption.h}`,
                          }}
                          className="relative"
                          draggable={editMode}
                          onDragStart={() => setDraggingSlotId(slot.slotId)}
                          onDragEnd={() => setDraggingSlotId(null)}
                          onDragOver={(event) => {
                            if (!editMode) return
                            event.preventDefault()
                          }}
                          onDrop={() => {
                            if (!editMode || !draggingSlotId) return
                            reorderWidgetInRow(row.id, draggingSlotId, slot.slotId)
                            setDraggingSlotId(null)
                          }}
                        >
                          <div
                            className={`group h-full overflow-hidden ${
                              editMode ? "cursor-move" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between mb-3 min-h-[28px]">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Settings className="w-4 h-4 text-muted-foreground" />
                                {widget.title}
                              </div>
                              {editMode && (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleRemoveWidget(widget.id)}
                                    className="p-1"
                                  >
                                    <X className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="h-[calc(100%-40px)] min-h-0 overflow-auto pr-1">
                              <WidgetRenderer
                                widget={widget}
                                loading={dashboardLoading}
                                overview={overview}
                                dailyStats={dailyStats}
                                topWorkflows={topWorkflows}
                                recentExecutions={recentExecutions}
                                integrationStats={integrationStats}
                                integrations={integrations}
                                size={size}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  </div>
                </div>
              </div>
            )
          })}
          {editMode && (
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={addRow}>
                Add Row
              </Button>
            </div>
          )}
        </div>
      )}

      <AddWidgetDialog
        open={showAddWidget}
        integrations={integrations}
        onClose={() => setShowAddWidget(false)}
        onCreate={handleAddWidget}
        maxCols={pendingMaxCols}
        defaultSize={pendingSlotSize}
      />
      {savingLayout && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Saving layout...
        </div>
      )}
    </div>
  )
}

function WidgetRenderer({
  widget,
  loading,
  overview,
  dailyStats,
  topWorkflows,
  recentExecutions,
  integrationStats,
  integrations,
  size = "large",
}: {
  widget: any
  loading: boolean
  overview: any
  dailyStats: any[]
  topWorkflows: any[]
  recentExecutions: any[]
  integrationStats: any
  integrations: any[]
  size?: "small" | "medium" | "large"
}) {
  switch (widget.type) {
    case "total_executions":
      return (
        <StatCard
          title="Total Executions"
          value={overview?.total?.toLocaleString() || "0"}
          icon={Zap}
          loading={loading}
          size={size}
        />
      )
    case "success_rate":
      return (
        <StatCard
          title="Success Rate"
          value={`${overview?.successRate || 0}%`}
          icon={CheckCircle2}
          loading={loading}
          size={size}
          trend={
            overview?.successRate
              ? {
                  direction: overview.successRate >= 90 ? "up" : overview.successRate >= 70 ? "neutral" : "down",
                  value: overview.successRate >= 90 ? "Good" : overview.successRate >= 70 ? "Fair" : "Low",
                }
              : undefined
          }
        />
      )
    case "failed_executions":
      return (
        <StatCard
          title="Failed Executions"
          value={overview?.failed?.toLocaleString() || "0"}
          icon={XCircle}
          loading={loading}
          size={size}
        />
      )
    case "avg_execution_time":
      return (
        <StatCard
          title="Avg. Execution Time"
          value={formatDuration(overview?.avgExecutionTimeMs || 0)}
          icon={Clock}
          loading={loading}
          size={size}
        />
      )
    case "execution_history":
      return <ExecutionChart dailyStats={dailyStats} loading={loading} size={size} />
    case "top_workflows":
      return <TopWorkflows workflows={topWorkflows} loading={loading} size={size} />
    case "recent_executions":
      return <RecentExecutions executions={recentExecutions} loading={loading} size={size} />
    case "integration_health":
      return <IntegrationHealth stats={integrationStats} loading={loading} />
    case "custom":
      return (
        <Card className="h-full">
          <CardContent className="p-4 space-y-2 h-full">
            <div className="text-sm text-muted-foreground">Custom widget</div>
            <div className="text-xs text-muted-foreground">
              Integration: {widget.config?.integration || "Not set"}
            </div>
            <div className="text-xs text-muted-foreground">
              Schedule: {widget.schedule || "on_demand"}
            </div>
            <div className="text-xs text-muted-foreground">
              Data source: {widget.config?.metric || "Not set"}
            </div>
          </CardContent>
        </Card>
      )
    default:
      return (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Unsupported widget type.
          </CardContent>
        </Card>
      )
  }
}

function AddWidgetDialog({
  open,
  integrations,
  onClose,
  onCreate,
  maxCols,
  defaultSize,
}: {
  open: boolean
  integrations: any[]
  onClose: () => void
  onCreate: (widget: any, size: string) => void
  maxCols: number | null
  defaultSize: string
}) {
  const [type, setType] = useState("total_executions")
  const [title, setTitle] = useState("Total Executions")
  const [schedule, setSchedule] = useState("on_demand")
  const [size, setSize] = useState("small")
  const [integration, setIntegration] = useState("")
  const [metric, setMetric] = useState("")
  const [advancedConfig, setAdvancedConfig] = useState("")
  const [advancedError, setAdvancedError] = useState<string | null>(null)

  const presetOptions = [
    {
      value: "total_executions",
      label: "Total Executions",
      description: "Total workflow runs in the selected period.",
      icon: Zap,
    },
    {
      value: "success_rate",
      label: "Success Rate",
      description: "Percentage of successful runs.",
      icon: CheckCircle2,
    },
    {
      value: "failed_executions",
      label: "Failed Executions",
      description: "Count of failed workflow runs.",
      icon: XCircle,
    },
    {
      value: "avg_execution_time",
      label: "Avg. Execution Time",
      description: "Average duration across runs.",
      icon: Clock,
    },
    {
      value: "execution_history",
      label: "Execution History",
      description: "Bar chart of daily executions.",
      icon: BarChart3,
    },
    {
      value: "top_workflows",
      label: "Top Workflows",
      description: "Most active workflows.",
      icon: Workflow,
    },
    {
      value: "recent_executions",
      label: "Recent Executions",
      description: "Latest workflow runs.",
      icon: Activity,
    },
    {
      value: "integration_health",
      label: "Integration Health",
      description: "Status of connected apps.",
      icon: Link2,
    },
    {
      value: "custom",
      label: "Custom (Integration)",
      description: "Build a widget from an integration metric.",
      icon: Settings,
    },
  ]

  useEffect(() => {
    const match = presetOptions.find((opt) => opt.value === type)
    if (match && type !== "custom") {
      setTitle(match.label)
    }
  }, [type])

  useEffect(() => {
    if (open) {
      setSize(defaultSize || "small")
    }
  }, [open, defaultSize])

  useEffect(() => {
    if (!maxCols) return
    const allowed = SIZE_OPTIONS.filter((option) => option.w <= maxCols)
    if (allowed.length === 0) return
    if (!allowed.find((option) => option.value === size)) {
      setSize(allowed[allowed.length - 1].value)
    }
  }, [maxCols, size])

  const handleCreate = () => {
    let config: any = {}
    if (type === "custom") {
      if (advancedConfig.trim()) {
        try {
          JSON.parse(advancedConfig)
          setAdvancedError(null)
        } catch (error) {
          setAdvancedError("Advanced JSON is invalid. Please fix it before saving.")
          return
        }
      }
      config = {
        integration,
        metric,
        advanced: advancedConfig ? JSON.parse(advancedConfig) : undefined,
      }
    }
    onCreate({ type, title, schedule, config }, size)
  }
  const selectedOption = presetOptions.find((option) => option.value === type)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(96vw,1100px)] max-w-none sm:max-w-[1100px] sm:w-[min(96vw,1100px)] max-h-[90vh] overflow-y-auto bg-white/95 dark:bg-slate-950/95">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Add Widget
          </DialogTitle>
          <DialogDescription>
            Choose a preset widget or configure a custom analytics widget from your connected apps.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8">
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Widget Library
            </div>
            <div className="space-y-3">
              {presetOptions.map((option) => {
                const Icon = option.icon
                const selected = option.value === type
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setType(option.value)}
                    aria-pressed={selected}
                    className={`w-full text-left border rounded-xl p-4 transition ${
                      selected
                        ? "border-primary/60 bg-primary/10 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted/80 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{option.label}</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">
                          {option.description}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 border-b pb-5">
              <div>
                <div className="text-sm font-semibold">Widget Details</div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {selectedOption?.description || "Configure the widget settings."}
                </div>
              </div>
              {selectedOption && (
                <Badge variant="outline" className="text-xs rounded-full px-3 py-1">
                  {selectedOption.label}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <input
                  className="w-full border rounded-lg p-2.5 text-sm bg-background"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Refresh Schedule</label>
                <Select value={schedule} onValueChange={setSchedule}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_demand">On demand only</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="bi_weekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Widget Size</label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_OPTIONS.filter((option) =>
                      maxCols ? option.w <= maxCols : true
                    ).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {type === "custom" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Integration</label>
                    <Select value={integration} onValueChange={setIntegration}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select integration" />
                      </SelectTrigger>
                      <SelectContent>
                        {integrations.map((i: any) => (
                          <SelectItem key={i.id} value={i.provider}>
                            {i.provider}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Metric</label>
                    <input
                      className="w-full border rounded-lg p-2.5 text-sm bg-background"
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                      placeholder="e.g. total_revenue"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Advanced JSON</label>
                  <textarea
                    className="w-full border rounded-lg p-2.5 text-sm h-28 bg-background"
                    value={advancedConfig}
                    onChange={(e) => setAdvancedConfig(e.target.value)}
                    placeholder='{"filters": {"status": "paid"}}'
                  />
                  {advancedError && (
                    <p className="text-xs text-red-500 mt-1">{advancedError}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>Add Widget</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
