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
import { ResponsiveGridLayout } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"

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
}: {
  title: string
  value: string | number
  icon: React.ElementType
  description?: string
  trend?: { direction: "up" | "down" | "neutral"; value: string }
  loading?: boolean
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
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
    <Card>
      <CardContent className="p-6">
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
        <h3 className="text-2xl font-bold mb-1">{value}</h3>
        <p className="text-sm text-muted-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

function ExecutionChart({ dailyStats, loading }: { dailyStats: any[]; loading: boolean }) {
  if (loading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
          <CardDescription>Daily workflow executions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-48">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="flex-1 h-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const maxExecutions = Math.max(...dailyStats.map((d) => Number(d.executions) || 0), 1)

  // Take last 7 days for the chart
  const chartData = dailyStats.slice(-7)

  return (
    <Card className="col-span-full">
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
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Activity className="w-12 h-12 mb-2 opacity-50" />
            <p>No execution data yet</p>
            <p className="text-sm">Run some workflows to see analytics here</p>
          </div>
        ) : (
          <div className="flex items-end gap-2 h-48">
            {chartData.map((day, i) => {
              const executions = Number(day.executions) || 0
              const successful = Number(day.successful) || 0
              const failed = Number(day.failed) || 0
              const height = maxExecutions > 0 ? (executions / maxExecutions) * 100 : 0
              const successHeight =
                executions > 0 ? (successful / executions) * height : 0
              const failedHeight = height - successHeight

              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full flex flex-col justify-end rounded-t-sm overflow-hidden h-32"
                  >
                    <div
                      className="w-full bg-red-500/80 dark:bg-red-600/80 transition-all"
                      style={{ height: `${failedHeight}%` }}
                      title={`${failed} failed`}
                    />
                    <div
                      className="w-full bg-green-500/80 dark:bg-green-600/80 transition-all"
                      style={{ height: `${successHeight}%` }}
                      title={`${successful} successful`}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">{day.dayName}</div>
                  <div className="text-xs font-medium">{executions}</div>
                </div>
              )
            })}
          </div>
        )}
        <div className="flex items-center justify-center gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-green-500/80" />
            <span className="text-muted-foreground">Successful</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-red-500/80" />
            <span className="text-muted-foreground">Failed</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TopWorkflows({
  workflows,
  loading,
}: {
  workflows: any[]
  loading: boolean
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Workflows</CardTitle>
          <CardDescription>Most executed workflows</CardDescription>
        </CardHeader>
        <CardContent>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Workflow className="w-5 h-5" />
          Top Workflows
        </CardTitle>
        <CardDescription>Most executed workflows in this period</CardDescription>
      </CardHeader>
      <CardContent>
        {workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Workflow className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">No workflows executed yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {workflows.slice(0, 5).map((workflow, i) => (
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
}: {
  executions: any[]
  loading: boolean
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Executions</CardTitle>
          <CardDescription>Latest workflow runs</CardDescription>
        </CardHeader>
        <CardContent>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Recent Executions
        </CardTitle>
        <CardDescription>Latest workflow runs</CardDescription>
      </CardHeader>
      <CardContent>
        {executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Activity className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">No recent executions</p>
            <p className="text-xs">Execute a workflow to see it here</p>
          </div>
        ) : (
          <div className="space-y-1">
            {executions.map((exec) => (
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
      <Card>
        <CardHeader>
          <CardTitle>Integration Health</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-24" />
        </CardContent>
      </Card>
    )
  }

  const { connected, expiring, expired, disconnected, total } = stats

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="w-5 h-5" />
          Integration Health
        </CardTitle>
        <CardDescription>Status of your connected apps</CardDescription>
      </CardHeader>
      <CardContent>
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
  const [layout, setLayout] = useState<any[]>([])
  const [loadingWidgets, setLoadingWidgets] = useState(true)
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [savingLayout, setSavingLayout] = useState(false)
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
        setWidgets(data.widgets || [])
        setLayout(data.layout || [])
      } catch (error) {
        console.error("Failed to load widgets", error)
      } finally {
        setLoadingWidgets(false)
      }
    }

    loadWidgets()
  }, [])

  const persistLayout = (nextLayout: any[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(async () => {
      setSavingLayout(true)
      try {
        await fetch("/api/analytics/widgets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout: nextLayout }),
        })
      } finally {
        setSavingLayout(false)
      }
    }, 500)
  }

  const handleLayoutChange = (nextLayout: any[]) => {
    setLayout(nextLayout)
    persistLayout(nextLayout)
  }

  const handleRemoveWidget = async (widgetId: string) => {
    await fetch(`/api/analytics/widgets/${widgetId}`, { method: "DELETE" })
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId))
    setLayout((prev) => prev.filter((l) => l.i !== widgetId))
  }

  const handleAddWidget = async (widget: any) => {
    const res = await fetch("/api/analytics/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(widget),
    })
    const created = await res.json()
    setWidgets((prev) => [...prev, created])
    setLayout((prev) => [
      ...prev,
      {
        i: created.id,
        x: 0,
        y: Infinity,
        w: 4,
        h: 3,
        minW: 2,
        minH: 2,
      },
    ])
    setShowAddWidget(false)
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
    <div className="space-y-6">
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
          <Button size="sm" onClick={() => setShowAddWidget(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Widget
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
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: layout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
          rowHeight={40}
          margin={[16, 16]}
          isDraggable
          isResizable
          onLayoutChange={(next) => handleLayoutChange(next)}
        >
          {widgets.map((widget) => (
            <div key={widget.id} className="group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  {widget.title}
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 transition"
                  onClick={() => handleRemoveWidget(widget.id)}
                >
                  <X className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                </button>
              </div>
              <WidgetRenderer
                widget={widget}
                loading={dashboardLoading}
                overview={overview}
                dailyStats={dailyStats}
                topWorkflows={topWorkflows}
                recentExecutions={recentExecutions}
                integrationStats={integrationStats}
                integrations={integrations}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      <AddWidgetDialog
        open={showAddWidget}
        integrations={integrations}
        onClose={() => setShowAddWidget(false)}
        onCreate={handleAddWidget}
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
}: {
  widget: any
  loading: boolean
  overview: any
  dailyStats: any[]
  topWorkflows: any[]
  recentExecutions: any[]
  integrationStats: any
  integrations: any[]
}) {
  switch (widget.type) {
    case "total_executions":
      return (
        <StatCard
          title="Total Executions"
          value={overview?.total?.toLocaleString() || "0"}
          icon={Zap}
          loading={loading}
        />
      )
    case "success_rate":
      return (
        <StatCard
          title="Success Rate"
          value={`${overview?.successRate || 0}%`}
          icon={CheckCircle2}
          loading={loading}
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
        />
      )
    case "avg_execution_time":
      return (
        <StatCard
          title="Avg. Execution Time"
          value={formatDuration(overview?.avgExecutionTimeMs || 0)}
          icon={Clock}
          loading={loading}
        />
      )
    case "execution_history":
      return <ExecutionChart dailyStats={dailyStats} loading={loading} />
    case "top_workflows":
      return <TopWorkflows workflows={topWorkflows} loading={loading} />
    case "recent_executions":
      return <RecentExecutions executions={recentExecutions} loading={loading} />
    case "integration_health":
      return <IntegrationHealth stats={integrationStats} loading={loading} />
    case "custom":
      return (
        <Card>
          <CardContent className="p-4 space-y-2">
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
}: {
  open: boolean
  integrations: any[]
  onClose: () => void
  onCreate: (widget: any) => void
}) {
  const [type, setType] = useState("total_executions")
  const [title, setTitle] = useState("Total Executions")
  const [schedule, setSchedule] = useState("on_demand")
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
    onCreate({ type, title, schedule, config })
  }
  const selectedOption = presetOptions.find((option) => option.value === type)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Add Widget
          </DialogTitle>
          <DialogDescription>
            Choose a preset widget or configure a custom analytics widget from your connected apps.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <div className="space-y-3">
            <div className="text-sm font-medium text-muted-foreground">Widget Library</div>
            <div className="space-y-2">
              {presetOptions.map((option) => {
                const Icon = option.icon
                const selected = option.value === type
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setType(option.value)}
                    aria-pressed={selected}
                    className={`w-full text-left border rounded-lg p-3 transition ${
                      selected
                        ? "border-primary/60 bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 border-b pb-4">
              <div>
                <div className="text-sm font-medium">Widget Details</div>
                <div className="text-xs text-muted-foreground">
                  {selectedOption?.description || "Configure the widget settings."}
                </div>
              </div>
              {selectedOption && (
                <Badge variant="outline" className="text-xs">
                  {selectedOption.label}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <input
                  className="w-full border rounded-md p-2 text-sm"
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
                      className="w-full border rounded-md p-2 text-sm"
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                      placeholder="e.g. total_revenue"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Advanced JSON</label>
                  <textarea
                    className="w-full border rounded-md p-2 text-sm h-24"
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
