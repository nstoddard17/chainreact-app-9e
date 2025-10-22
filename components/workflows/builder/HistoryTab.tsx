"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  ChevronRight,
  Copy,
  Check,
  History,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

interface ExecutionStep {
  step_number: number
  node_id: string
  node_title: string
  node_type: string
  status: 'success' | 'failed' | 'skipped'
  input_data?: any
  output_data?: any
  error_message?: string
  started_at: string
  completed_at: string
  duration_ms: number
}

interface Execution {
  id: string
  workflow_id: string
  status: 'success' | 'failed' | 'running'
  trigger_type: string
  trigger_data?: any
  started_at: string
  completed_at?: string
  duration_ms?: number
  steps: ExecutionStep[]
  tasks_used: number
}

interface HistoryTabProps {
  workflowId: string
}

export function HistoryTab({ workflowId }: HistoryTabProps) {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("7")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null)
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())
  const [copiedJson, setCopiedJson] = useState<string>("")

  useEffect(() => {
    fetchExecutions()
  }, [workflowId, statusFilter, dateFilter])

  const fetchExecutions = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        workflow_id: workflowId,
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(dateFilter !== "all" && { days: dateFilter }),
      })

      const response = await fetch(`/api/workflows/${workflowId}/executions?${params}`)
      const data = await response.json()

      if (data.success) {
        setExecutions(data.executions || [])
      }
    } catch (error) {
      console.error('Failed to fetch executions:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleStep = (stepNumber: number) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepNumber)) {
      newExpanded.delete(stepNumber)
    } else {
      newExpanded.add(stepNumber)
    }
    setExpandedSteps(newExpanded)
  }

  const copyJson = async (data: any, label: string) => {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopiedJson(label)
    setTimeout(() => setCopiedJson(""), 2000)
  }

  const filteredExecutions = executions.filter(exec => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        exec.trigger_type.toLowerCase().includes(query) ||
        exec.id.toLowerCase().includes(query)
      )
    }
    return true
  })

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="border-b bg-background p-4 space-y-4">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search executions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Filter */}
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button variant="outline" size="sm" onClick={fetchExecutions}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Execution List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Loading executions...</div>
          </div>
        ) : filteredExecutions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <History className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No executions found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {statusFilter !== "all" || dateFilter !== "all"
                ? "Try adjusting your filters"
                : "This workflow hasn't run yet"}
            </p>
          </div>
        ) : (
          filteredExecutions.map((execution) => (
            <button
              key={execution.id}
              onClick={() => setSelectedExecution(execution)}
              className="w-full text-left p-4 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Status and Time */}
                  <div className="flex items-center gap-2 mb-2">
                    {execution.status === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : execution.status === 'failed' ? (
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    ) : (
                      <Clock className="w-5 h-5 text-blue-500 flex-shrink-0 animate-spin" />
                    )}
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(execution.started_at), { addSuffix: true })}
                    </span>
                    <Badge
                      variant={
                        execution.status === 'success'
                          ? 'default'
                          : execution.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="text-xs"
                    >
                      {execution.status}
                    </Badge>
                  </div>

                  {/* Trigger Info */}
                  <div className="text-sm font-medium mb-1">
                    Triggered by: {execution.trigger_type}
                  </div>

                  {/* Duration and Steps */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {execution.duration_ms && (
                      <span>Duration: {(execution.duration_ms / 1000).toFixed(2)}s</span>
                    )}
                    <span>{execution.steps.length} steps</span>
                    {execution.tasks_used > 0 && (
                      <span>{execution.tasks_used} task{execution.tasks_used > 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              </div>
            </button>
          ))
        )}
      </div>

      {/* Execution Detail Modal */}
      <Dialog open={!!selectedExecution} onOpenChange={() => setSelectedExecution(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Execution Details
              {selectedExecution && (
                <Badge
                  variant={
                    selectedExecution.status === 'success'
                      ? 'default'
                      : selectedExecution.status === 'failed'
                      ? 'destructive'
                      : 'secondary'
                  }
                >
                  {selectedExecution.status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedExecution && formatDistanceToNow(new Date(selectedExecution.started_at), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          {selectedExecution && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Trigger</div>
                  <div className="font-medium">{selectedExecution.trigger_type}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Duration</div>
                  <div className="font-medium">
                    {selectedExecution.duration_ms ? `${(selectedExecution.duration_ms / 1000).toFixed(2)}s` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Steps</div>
                  <div className="font-medium">{selectedExecution.steps.length}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Tasks Used</div>
                  <div className="font-medium">{selectedExecution.tasks_used}</div>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-3">
                <h3 className="font-semibold">Execution Steps</h3>
                {selectedExecution.steps.map((step, index) => (
                  <div key={step.step_number} className="border rounded-lg overflow-hidden">
                    {/* Step Header */}
                    <button
                      onClick={() => toggleStep(step.step_number)}
                      className="w-full p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors"
                    >
                      {step.status === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                      ) : step.status === 'failed' ? (
                        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      ) : (
                        <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex-1 text-left">
                        <div className="font-medium">
                          Step {step.step_number}: {step.node_title}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {step.node_type} • {(step.duration_ms / 1000).toFixed(2)}s
                        </div>
                      </div>
                      <ChevronRight
                        className={cn(
                          "w-5 h-5 text-muted-foreground transition-transform",
                          expandedSteps.has(step.step_number) && "rotate-90"
                        )}
                      />
                    </button>

                    {/* Step Details */}
                    {expandedSteps.has(step.step_number) && (
                      <div className="border-t p-4 space-y-4 bg-muted/20">
                        {/* Error Message */}
                        {step.error_message && (
                          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <div className="text-sm font-medium text-destructive mb-1">Error</div>
                            <div className="text-sm text-destructive/90">{step.error_message}</div>
                          </div>
                        )}

                        {/* Input Data */}
                        {step.input_data && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-medium">Input Data</div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyJson(step.input_data, `input-${step.step_number}`)}
                              >
                                {copiedJson === `input-${step.step_number}` ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                            <pre className="text-xs bg-background p-3 rounded border overflow-x-auto">
                              {JSON.stringify(step.input_data, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Output Data */}
                        {step.output_data && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-medium">Output Data</div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyJson(step.output_data, `output-${step.step_number}`)}
                              >
                                {copiedJson === `output-${step.step_number}` ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                            <pre className="text-xs bg-background p-3 rounded border overflow-x-auto">
                              {JSON.stringify(step.output_data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
