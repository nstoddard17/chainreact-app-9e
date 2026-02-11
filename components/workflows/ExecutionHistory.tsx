"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Zap,
  Timer,
  FileText,
  RotateCcw,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { cn } from "@/lib/utils"
import { EnhancedEmptyState } from "@/components/common/EnhancedEmptyState"
import { useToast } from "@/hooks/use-toast"

export interface Execution {
  id: string
  workflow_id: string
  workflow_name?: string
  status: "running" | "success" | "failed" | "cancelled"
  trigger_type: string
  trigger_data?: any
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  error_message: string | null
  steps_completed: number
  steps_total: number
  output_data?: any
}

interface ExecutionHistoryProps {
  workflowId?: string
  limit?: number
  showWorkflowName?: boolean
  compact?: boolean
  className?: string
}

/**
 * Workflow Execution History component
 * Shows execution logs with details for debugging
 */
export function ExecutionHistory({
  workflowId,
  limit = 50,
  showWorkflowName = false,
  compact = false,
  className,
}: ExecutionHistoryProps) {
  const router = useRouter()
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchExecutions()
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchExecutions, 10000)
    return () => clearInterval(interval)
  }, [workflowId])

  const fetchExecutions = async () => {
    try {
      const params = new URLSearchParams()
      if (workflowId) params.set("workflow_id", workflowId)
      params.set("limit", String(limit))

      const response = await fetch(`/api/executions?${params}`)
      if (response.ok) {
        const data = await response.json()
        setExecutions(data.executions || [])
      }
    } catch (error) {
      console.error("Failed to fetch executions:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = async (executionId: string) => {
    try {
      const response = await fetch(`/api/executions/${executionId}/retry`, {
        method: "POST",
      })

      if (response.ok) {
        toast({
          title: "Workflow Restarted",
          description: "The workflow is being executed again.",
        })
        fetchExecutions()
      } else {
        throw new Error("Failed to retry execution")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to retry execution",
        variant: "destructive",
      })
    }
  }

  const getStatusConfig = (status: Execution["status"]) => {
    switch (status) {
      case "running":
        return {
          icon: RefreshCw,
          color: "text-blue-500",
          bgColor: "bg-blue-100 dark:bg-blue-900/30",
          label: "Running",
          badgeVariant: "outline" as const,
          badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
        }
      case "success":
        return {
          icon: CheckCircle2,
          color: "text-green-500",
          bgColor: "bg-green-100 dark:bg-green-900/30",
          label: "Success",
          badgeVariant: "outline" as const,
          badgeClass: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
        }
      case "failed":
        return {
          icon: XCircle,
          color: "text-red-500",
          bgColor: "bg-red-100 dark:bg-red-900/30",
          label: "Failed",
          badgeVariant: "outline" as const,
          badgeClass: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
        }
      case "cancelled":
        return {
          icon: AlertTriangle,
          color: "text-yellow-500",
          bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
          label: "Cancelled",
          badgeVariant: "outline" as const,
          badgeClass: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800",
        }
    }
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—"
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (executions.length === 0) {
    return (
      <EnhancedEmptyState
        type="executions"
        compact={compact}
        className={className}
      />
    )
  }

  if (compact) {
    // Compact list view for sidebar/widgets
    return (
      <div className={cn("space-y-2", className)}>
        {executions.slice(0, 5).map((execution) => {
          const statusConfig = getStatusConfig(execution.status)
          const StatusIcon = statusConfig.icon

          return (
            <div
              key={execution.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => {
                setSelectedExecution(execution)
                setDetailsOpen(true)
              }}
            >
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", statusConfig.bgColor)}>
                <StatusIcon className={cn("w-3.5 h-3.5", statusConfig.color, execution.status === "running" && "animate-spin")} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {showWorkflowName ? execution.workflow_name : execution.trigger_type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(execution.started_at), { addSuffix: true })}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <div className={className}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              {showWorkflowName && <TableHead>Workflow</TableHead>}
              <TableHead>Trigger</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {executions.map((execution) => {
              const statusConfig = getStatusConfig(execution.status)
              const StatusIcon = statusConfig.icon

              return (
                <TableRow key={execution.id} className="group">
                  <TableCell>
                    <Badge variant={statusConfig.badgeVariant} className={statusConfig.badgeClass}>
                      <StatusIcon className={cn("w-3 h-3 mr-1", execution.status === "running" && "animate-spin")} />
                      {statusConfig.label}
                    </Badge>
                  </TableCell>
                  {showWorkflowName && (
                    <TableCell>
                      <span
                        className="font-medium hover:underline cursor-pointer"
                        onClick={() => router.push(`/workflows/builder/${execution.workflow_id}`)}
                      >
                        {execution.workflow_name || "Unknown Workflow"}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">
                    {execution.trigger_type}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          {formatDistanceToNow(new Date(execution.started_at), { addSuffix: true })}
                        </TooltipTrigger>
                        <TooltipContent>
                          {format(new Date(execution.started_at), "PPpp")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      {formatDuration(execution.duration_ms)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      "text-sm",
                      execution.steps_completed === execution.steps_total
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    )}>
                      {execution.steps_completed}/{execution.steps_total}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => {
                                setSelectedExecution(execution)
                                setDetailsOpen(true)
                              }}
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View details</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {execution.status === "failed" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleRetry(execution.id)}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Retry execution</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Execution Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Execution Details
            </DialogTitle>
            <DialogDescription>
              {selectedExecution && format(new Date(selectedExecution.started_at), "PPpp")}
            </DialogDescription>
          </DialogHeader>

          {selectedExecution && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6 pr-4">
                {/* Status Overview */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Status</div>
                      <Badge
                        variant="outline"
                        className={getStatusConfig(selectedExecution.status).badgeClass}
                      >
                        {getStatusConfig(selectedExecution.status).label}
                      </Badge>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Duration</div>
                      <div className="text-lg font-semibold">
                        {formatDuration(selectedExecution.duration_ms)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Steps</div>
                      <div className="text-lg font-semibold">
                        {selectedExecution.steps_completed}/{selectedExecution.steps_total}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Error Message */}
                {selectedExecution.error_message && (
                  <Card className="border-red-200 dark:border-red-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                        <XCircle className="w-4 h-4" />
                        Error
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg overflow-x-auto">
                        {selectedExecution.error_message}
                      </pre>
                    </CardContent>
                  </Card>
                )}

                {/* Trigger Data */}
                {selectedExecution.trigger_data && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Trigger Data</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                        {JSON.stringify(selectedExecution.trigger_data, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                )}

                {/* Output Data */}
                {selectedExecution.output_data && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Output Data</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                        {JSON.stringify(selectedExecution.output_data, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Compact execution history widget for workflow builder sidebar
 */
interface ExecutionHistoryWidgetProps {
  workflowId: string
  className?: string
}

export function ExecutionHistoryWidget({ workflowId, className }: ExecutionHistoryWidgetProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Recent Executions
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ExecutionHistory
          workflowId={workflowId}
          limit={5}
          compact
        />
      </CardContent>
    </Card>
  )
}
