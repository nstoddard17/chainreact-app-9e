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
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { History, Clock, Loader2, CheckCircle, XCircle, AlertCircle, Play, TestTube, Coins } from "lucide-react"
import { format } from "date-fns"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface WorkflowExecution {
  id: string
  created_at: string
  execution_type: 'manual' | 'published' | 'sandbox' | 'live'
  status: 'success' | 'error' | 'pending'
  duration_ms: number
  credits_used: number
  nodes_executed: number
  error_message?: string
  trigger_data?: any
}

interface WorkflowHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
}

export function WorkflowHistoryDialog({
  open,
  onOpenChange,
  workflowId,
}: WorkflowHistoryDialogProps) {
  const [executions, setExecutions] = useState<WorkflowExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCredits, setTotalCredits] = useState(0)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    if (open && workflowId) {
      loadExecutions()
    }
  }, [open, workflowId])

  const loadExecutions = async () => {
    try {
      setLoading(true)

      // Fetch executions from workflow_executions table
      const { data, error } = await supabase
        .from('workflow_executions')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error

      const executionsData = (data || []).map((exec: any) => ({
        id: exec.id,
        created_at: exec.created_at,
        execution_type: determineExecutionType(exec),
        status: exec.status || 'success',
        duration_ms: exec.duration_ms || calculateDuration(exec.created_at, exec.completed_at),
        credits_used: calculateCredits(exec),
        nodes_executed: exec.nodes_executed || 0,
        error_message: exec.error_message,
        trigger_data: exec.trigger_data,
      }))

      setExecutions(executionsData)

      // Calculate total credits
      const total = executionsData.reduce((sum, exec) => sum + exec.credits_used, 0)
      setTotalCredits(total)
    } catch (error: any) {
      console.error('Error loading executions:', error)
      toast({
        title: "Error",
        description: "Failed to load execution history",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Determine execution type based on execution data
  const determineExecutionType = (exec: any): 'manual' | 'published' | 'sandbox' | 'live' => {
    if (exec.test_mode === true) return 'sandbox'
    if (exec.is_manual === true) return 'manual'
    if (exec.trigger_type === 'manual') return 'manual'
    return 'published'
  }

  // Calculate execution duration
  const calculateDuration = (startedAt: string, completedAt?: string): number => {
    if (!completedAt) return 0
    const start = new Date(startedAt).getTime()
    const end = new Date(completedAt).getTime()
    return end - start
  }

  // Calculate credits based on execution complexity
  const calculateCredits = (exec: any): number => {
    /*
     * Credit Calculation Formula:
     *
     * Base Credits:
     * - Each node executed: 1 credit
     *
     * AI Node Multipliers:
     * - AI Agent/Router: 5x credits (complex AI operations)
     * - AI Actions (summarize, extract, etc.): 3x credits
     *
     * Integration Multipliers:
     * - API calls (Gmail, Slack, etc.): 2x credits
     * - File operations: 1.5x credits
     *
     * Execution Time Bonus:
     * - < 1 second: 0 bonus
     * - 1-10 seconds: +1 credit
     * - 10-60 seconds: +3 credits
     * - > 60 seconds: +5 credits
     *
     * Data Volume Bonus:
     * - Small data (<1KB): 0 bonus
     * - Medium data (1-100KB): +1 credit
     * - Large data (>100KB): +3 credits
     */

    let credits = 0

    // Base credits from nodes executed
    const nodesExecuted = exec.nodes_executed || 0
    credits += nodesExecuted

    // AI node multipliers (check if any AI nodes were used)
    const hasAINodes = exec.ai_nodes_count || 0
    credits += hasAINodes * 4 // 5x total (1 base + 4 bonus)

    // Integration multipliers
    const integrationCalls = exec.integration_calls || 0
    credits += integrationCalls * 1 // 2x total (1 base + 1 bonus)

    // Execution time bonus
    const durationMs = exec.duration_ms || 0
    if (durationMs > 60000) credits += 5
    else if (durationMs > 10000) credits += 3
    else if (durationMs > 1000) credits += 1

    // Data volume bonus
    const dataSize = exec.data_size_bytes || 0
    if (dataSize > 100000) credits += 3
    else if (dataSize > 1000) credits += 1

    // Minimum 1 credit per execution
    return Math.max(1, credits)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-yellow-500'
    }
  }

  const getExecutionTypeLabel = (type: string) => {
    switch (type) {
      case 'manual':
        return 'Manual Run'
      case 'published':
        return 'Published Run'
      case 'sandbox':
        return 'Sandbox Test'
      case 'live':
        return 'Live Test'
      default:
        return 'Unknown'
    }
  }

  const getExecutionTypeIcon = (type: string) => {
    switch (type) {
      case 'sandbox':
        return <TestTube className="w-3 h-3" />
      case 'manual':
      case 'live':
        return <Play className="w-3 h-3" />
      default:
        return <History className="w-3 h-3" />
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
    const minutes = Math.floor(ms / 60000)
    const seconds = ((ms % 60000) / 1000).toFixed(0)
    return `${minutes}m ${seconds}s`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Execution History
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span>View all workflow test runs and executions</span>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Coins className="w-4 h-4 text-yellow-600" />
              <span className="text-foreground">Total Credits: {totalCredits}</span>
            </div>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : executions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No execution history yet</p>
            <p className="text-sm mt-2">Run a test to see execution history</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {executions.map((execution) => (
                <div
                  key={execution.id}
                  className="p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Status Indicator */}
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${getStatusColor(execution.status)}`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">
                          {format(new Date(execution.created_at), 'MMM d')} {format(new Date(execution.created_at), 'h:mm a')}
                        </span>
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          {getExecutionTypeIcon(execution.execution_type)}
                          {getExecutionTypeLabel(execution.execution_type)}
                        </Badge>
                      </div>

                      {/* Stats Row */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {/* Credits */}
                        <div className="flex items-center gap-1 font-medium">
                          <Coins className="w-3 h-3 text-yellow-600" />
                          <span className="text-foreground">{execution.credits_used}</span>
                          <span>credits</span>
                        </div>

                        {/* Duration */}
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatDuration(execution.duration_ms)}</span>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-1">
                          {getStatusIcon(execution.status)}
                          <span className="capitalize">{execution.status}</span>
                        </div>

                        {/* Nodes */}
                        {execution.nodes_executed > 0 && (
                          <span>{execution.nodes_executed} nodes</span>
                        )}
                      </div>

                      {/* Error Message */}
                      {execution.error_message && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 p-2 rounded">
                          {execution.error_message}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
