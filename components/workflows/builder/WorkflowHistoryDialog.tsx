"use client"

import { useState, useEffect } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  History, Loader2, CheckCircle2, XCircle, AlertCircle,
  Download, RefreshCw, Filter, Clock, Activity,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type FlowRunSummary = {
  id: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  sessionType?: string
  metadata?: Record<string, any>
}

interface WorkflowHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  onSelectRun?: (runId: string) => Promise<void> | void
  activeRunId?: string | null
}

const STATUS_CONFIG: Record<string, { label: string; iconColor: string; badgeClass: string }> = {
  success: {
    label: "Success",
    iconColor: "text-emerald-500 dark:text-emerald-400",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40",
  },
  error: {
    label: "Error",
    iconColor: "text-red-500 dark:text-red-400",
    badgeClass: "bg-red-100 text-red-800 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40",
  },
  failed: {
    label: "Error",
    iconColor: "text-red-500 dark:text-red-400",
    badgeClass: "bg-red-100 text-red-800 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40",
  },
  running: {
    label: "Listening",
    iconColor: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40",
  },
  cancelled: {
    label: "Cancelled",
    iconColor: "text-amber-500 dark:text-amber-400",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40",
  },
}

const DEFAULT_STATUS = {
  label: "Unknown",
  iconColor: "text-gray-400 dark:text-gray-500",
  badgeClass: "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/40",
}

const StatusIcon = ({ status }: { status: string }) => {
  const cfg = STATUS_CONFIG[status] || DEFAULT_STATUS
  const iconClass = cn("h-4 w-4", cfg.iconColor, status === "running" && "animate-spin")
  switch (status) {
    case "success": return <CheckCircle2 className={iconClass} />
    case "error": case "failed": return <XCircle className={iconClass} />
    case "running": return <RefreshCw className={iconClass} />
    case "cancelled": return <AlertCircle className={iconClass} />
    default: return <Clock className={iconClass} />
  }
}

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = STATUS_CONFIG[status] || DEFAULT_STATUS
  return <Badge variant="outline" className={cn("text-[11px] whitespace-nowrap", cfg.badgeClass)}>{cfg.label}</Badge>
}

export function WorkflowHistoryDialog({
  open, onOpenChange, workflowId,
}: WorkflowHistoryDialogProps) {
  const [runs, setRuns] = useState<FlowRunSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all")
  const { toast } = useToast()

  // Stats: success rate only counts completed runs (not running/listening)
  const successCount = runs.filter((r) => r.status === "success").length
  const failedCount = runs.filter((r) => r.status === "error" || r.status === "failed").length
  const completedCount = successCount + failedCount
  const avgDuration = (() => {
    const done = runs.filter((r) => r.startedAt && r.finishedAt)
    if (!done.length) return 0
    return done.reduce((a, r) => a + (new Date(r.finishedAt!).getTime() - new Date(r.startedAt!).getTime()), 0) / done.length
  })()

  const filteredRuns = runs.filter((r) => {
    if (filter === "success") return r.status === "success"
    if (filter === "failed") return r.status === "error" || r.status === "failed"
    return true
  })

  useEffect(() => { if (open) void loadRuns() }, [open, workflowId])

  const loadRuns = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/workflows/v2/api/flows/${workflowId}/runs/history`)
      if (!res.ok) throw new Error("Failed to load runs")
      const data = await res.json()
      setRuns(data.runs || [])
    } catch (err) {
      console.error("[WorkflowHistoryDialog] loadRuns error:", err)
      toast({ title: "Unable to load history", description: "Please try again.", variant: "destructive" })
    } finally { setLoading(false) }
  }

  const exportRuns = () => {
    if (!runs.length) return
    const blob = new Blob([JSON.stringify({ runs }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `workflow-history-${workflowId.slice(0, 8)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const fmtTime = (v?: string | null) => {
    if (!v) return "N/A"
    try { return new Date(v).toLocaleString() } catch { return v }
  }

  const fmtDuration = (start?: string | null, end?: string | null) => {
    if (!start || !end) return "—"
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const fmtMs = (ms: number) => {
    if (!ms) return "—"
    if (ms < 1000) return `${Math.round(ms)}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const statCards: { icon: typeof Activity; label: string; value: string | number; color: string }[] = [
    { icon: Activity, label: "Total Runs", value: runs.length, color: "gray" },
    { icon: CheckCircle2, label: "Success Rate", value: completedCount > 0 ? `${((successCount / completedCount) * 100).toFixed(0)}%` : "—", color: "emerald" },
    { icon: XCircle, label: "Failures", value: failedCount, color: "red" },
    { icon: Clock, label: "Avg Duration", value: fmtMs(avgDuration), color: "blue" },
  ]

  const colorMap: Record<string, { border: string; text: string; value: string }> = {
    gray: { border: "border-gray-200 dark:border-gray-700", text: "text-gray-600 dark:text-gray-400", value: "text-gray-900 dark:text-white" },
    emerald: { border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-600 dark:text-emerald-400", value: "text-emerald-700 dark:text-emerald-300" },
    red: { border: "border-red-200 dark:border-red-800", text: "text-red-600 dark:text-red-400", value: "text-red-700 dark:text-red-300" },
    blue: { border: "border-blue-200 dark:border-blue-800", text: "text-blue-600 dark:text-blue-400", value: "text-blue-700 dark:text-blue-300" },
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <History className="w-5 h-5" />
                Execution History
              </DialogTitle>
              <DialogDescription className="text-sm mt-1">
                Review past workflow runs.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadRuns()} disabled={loading} className="h-9">
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </DialogHeader>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-12 px-6">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 px-6 text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No executions yet</p>
            <p className="text-sm mt-2">Run the workflow or a node test to generate history.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b bg-gray-50/50 dark:bg-gray-900/50 flex-shrink-0">
              {statCards.map((sc) => {
                const c = colorMap[sc.color]
                return (
                  <div key={sc.label} className={cn("bg-white dark:bg-gray-800 rounded-lg border p-3", c.border)}>
                    <div className="flex items-center gap-2 mb-1">
                      <sc.icon className={cn("h-3.5 w-3.5", c.text)} />
                      <span className={cn("text-xs font-medium", c.text)}>{sc.label}</span>
                    </div>
                    <div className={cn("text-xl font-bold", c.value)}>{sc.value}</div>
                  </div>
                )
              })}
            </div>

            {/* Runs section - full width */}
            <div className="px-6 pt-4 pb-6">
              {/* Runs header with filters + export */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  {(["all", "success", "failed"] as const).map((f) => (
                    <Button key={f} size="sm" variant={filter === f ? "default" : "outline"}
                      onClick={() => setFilter(f)} className="h-7 px-2.5 text-xs capitalize">
                      {f === "all" ? `All (${runs.length})` : f === "success" ? `Success (${successCount})` : `Failed (${failedCount})`}
                    </Button>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={exportRuns} disabled={!runs.length} className="h-7 px-2.5 text-xs">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Export
                </Button>
              </div>

              {/* Run list container with scroll */}
              <div className="max-h-[40vh] overflow-y-auto rounded-lg border bg-gray-50/30 dark:bg-gray-900/30 p-2 space-y-1.5">
                {filteredRuns.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No matching runs</p>
                  </div>
                ) : filteredRuns.map((run) => (
                  <div key={run.id}
                    className={cn(
                      "border rounded-lg px-4 py-3 transition-all bg-white dark:bg-gray-900",
                      "hover:bg-accent hover:shadow-sm hover:border-gray-400 dark:hover:border-gray-500",
                    )}>
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0"><StatusIcon status={run.status} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {run.sessionType === "webhook" ? "Triggered" : "Manual"}
                          </span>
                          <StatusBadge status={run.status} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{fmtTime(run.startedAt)}</div>
                      </div>
                      <div className="text-xs text-muted-foreground flex-shrink-0">
                        {fmtDuration(run.startedAt, run.finishedAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
