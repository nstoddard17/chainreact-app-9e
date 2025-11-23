"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { History, Loader2, CheckCircle2, XCircle, AlertCircle, Play, Download } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type FlowRunSummary = {
  id: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  revisionId?: string | null
  metadata?: Record<string, any>
}

type RunNodeDetails = {
  id: string
  node_id: string
  status: string
  duration_ms: number | null
  created_at: string
  output: any
  error: any
}

interface WorkflowHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  onSelectRun?: (runId: string) => Promise<void> | void
  activeRunId?: string | null
}

export function WorkflowHistoryDialog({
  open,
  onOpenChange,
  workflowId,
  onSelectRun,
  activeRunId,
}: WorkflowHistoryDialogProps) {
  const [runs, setRuns] = useState<FlowRunSummary[]>([])
  const [selectedRun, setSelectedRun] = useState<FlowRunSummary | null>(null)
  const [nodes, setNodes] = useState<RunNodeDetails[]>([])
  const [loading, setLoading] = useState(false)
  const [nodesLoading, setNodesLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      void loadRuns()
    }
  }, [open, workflowId])

  const loadRuns = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/workflows/v2/api/flows/${workflowId}/runs/history`)
      if (!response.ok) {
        throw new Error("Failed to load runs")
      }
      const data = await response.json()
      setRuns(data.runs || [])
      if (data.runs?.length) {
        setSelectedRun((previous) => previous ?? data.runs[0])
        void loadRunNodes(data.runs[0])
      } else {
        setSelectedRun(null)
        setNodes([])
      }
    } catch (error) {
      console.error("[WorkflowHistoryDialog] loadRuns error:", error)
      toast({
        title: "Unable to load history",
        description: "We couldn't fetch workflow runs. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const loadRunNodes = async (run: FlowRunSummary) => {
    try {
      setNodesLoading(true)
      const response = await fetch(`/workflows/v2/api/runs/${run.id}/nodes`)
      if (!response.ok) {
        throw new Error("Failed to load run details")
      }
      const data = await response.json()
      setNodes(data.nodes || [])
      setSelectedRun(run)
    } catch (error) {
      console.error("[WorkflowHistoryDialog] loadRunNodes error:", error)
      toast({
        title: "Unable to load run",
        description: "We couldn't fetch node results for this run.",
        variant: "destructive",
      })
    } finally {
      setNodesLoading(false)
    }
  }

  const handleSetActiveRun = async (run: FlowRunSummary) => {
    if (!onSelectRun) return
    await onSelectRun(run.id)
    toast({
      title: "Run selected",
      description: "Results tabs will now show this run's outputs.",
    })
    onOpenChange(false)
  }

  const exportNodes = () => {
    if (!selectedRun) return
    const blob = new Blob([JSON.stringify({ run: selectedRun, nodes }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    const startedAt = selectedRun.startedAt ? new Date(selectedRun.startedAt).toISOString() : "unknown"
    link.download = `workflow-run-${selectedRun.id}-${startedAt}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const formatTimestamp = (value?: string | null) => {
    if (!value) return "N/A"
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

  const formatDuration = (start?: string | null, end?: string | null) => {
    if (!start || !end) return "—"
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Success
          </Badge>
        )
      case "error":
        return (
          <Badge variant="secondary" className="bg-red-100 text-red-700 border border-red-200">
            <XCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 border border-amber-200">
            <AlertCircle className="w-3 h-3 mr-1" />
            {status}
          </Badge>
        )
    }
  }

  const getSourceLabel = (run: FlowRunSummary) => {
    const source = run.metadata?.source || run.metadata?.trigger || "manual"
    switch (source) {
      case "scheduler":
      case "cron":
        return "Scheduled Run"
      case "webhook":
        return "Webhook"
      case "node_test":
        return "Node Test"
      default:
        return "Manual"
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Execution History
          </DialogTitle>
          <DialogDescription>
            Review past workflow runs and inspect node-level output for each execution.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No executions yet</p>
            <p className="text-sm mt-2">Run the workflow or a node test to generate history.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            <Card className="h-[480px] flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Runs</CardTitle>
              </CardHeader>
              <ScrollArea className="flex-1">
                <div className="space-y-2 px-3 pb-4">
                  {runs.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => void loadRunNodes(run)}
                      className={cn(
                        "w-full text-left border rounded-lg px-3 py-2 transition hover:bg-accent",
                        selectedRun?.id === run.id && "border-primary bg-primary/5",
                        activeRunId === run.id && "ring-1 ring-primary"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{getSourceLabel(run)}</span>
                        {getStatusBadge(run.status)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatTimestamp(run.startedAt)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Duration: {formatDuration(run.startedAt, run.finishedAt)}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </Card>

            <Card className="h-[480px] flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {selectedRun ? `Run ${selectedRun.id.slice(0, 8)}…` : "Select a run"}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportNodes}
                    disabled={!selectedRun || nodes.length === 0}
                    className="hidden sm:flex"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                  {selectedRun && (
                    <Button size="sm" onClick={() => void handleSetActiveRun(selectedRun)}>
                      <Play className="w-4 h-4 mr-2" />
                      View in Builder
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                {nodesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : nodes.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    Select a run to view node details.
                  </div>
                ) : (
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-3">
                      {nodes.map((node) => (
                        <div key={node.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{node.node_id}</p>
                              <p className="text-xs text-muted-foreground">
                                Started {formatTimestamp(node.created_at)}
                              </p>
                            </div>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    {getStatusBadge(node.status)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Duration:{" "}
                                  {node.duration_ms ? `${node.duration_ms}ms` : "not recorded"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          {node.output && Object.keys(node.output || {}).length > 0 && (
                            <pre className="mt-2 rounded bg-muted/40 p-2 text-xs overflow-auto">
                              {JSON.stringify(node.output, null, 2)}
                            </pre>
                          )}
                          {node.error && (
                            <pre className="mt-2 rounded bg-red-50 text-red-700 p-2 text-xs overflow-auto border border-red-100">
                              {JSON.stringify(node.error, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
