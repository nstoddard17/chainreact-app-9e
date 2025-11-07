'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabaseClient'
import { Progress } from '@/components/ui/progress'
import { Card } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoopExecution {
  id: string
  node_id: string
  max_iterations: number
  iteration_count: number
  current_item_index: number | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  loop_data: any
  error_message: string | null
  started_at: string
  completed_at: string | null
}

interface LoopProgressIndicatorProps {
  sessionId: string
  nodeId?: string
  className?: string
  compact?: boolean
}

export function LoopProgressIndicator({
  sessionId,
  nodeId,
  className,
  compact = false
}: LoopProgressIndicatorProps) {
  const [loopExecutions, setLoopExecutions] = useState<LoopExecution[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Fetch initial loop executions
    const fetchLoopExecutions = async () => {
      setIsLoading(true)

      let query = supabase
        .from('loop_executions')
        .select('*')
        .eq('session_id', sessionId)
        .order('started_at', { ascending: false })

      if (nodeId) {
        query = query.eq('node_id', nodeId)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching loop executions:', error)
      } else if (data) {
        setLoopExecutions(data as LoopExecution[])
      }

      setIsLoading(false)
    }

    fetchLoopExecutions()

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`loop-progress-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'loop_executions',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setLoopExecutions(prev => [payload.new as LoopExecution, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setLoopExecutions(prev =>
              prev.map(loop =>
                loop.id === payload.new.id ? (payload.new as LoopExecution) : loop
              )
            )
          } else if (payload.eventType === 'DELETE') {
            setLoopExecutions(prev =>
              prev.filter(loop => loop.id !== payload.old.id)
            )
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [sessionId, nodeId, supabase])

  if (isLoading) {
    return null
  }

  if (loopExecutions.length === 0) {
    return null
  }

  if (compact) {
    // Compact view for inline display
    const activeLoop = loopExecutions.find(l => l.status === 'running') || loopExecutions[0]
    const progress = (activeLoop.iteration_count / activeLoop.max_iterations) * 100

    return (
      <div className={cn("inline-flex items-center gap-2 text-sm", className)}>
        <Repeat className="h-4 w-4 animate-spin" />
        <span className="font-medium">{activeLoop.iteration_count}/{activeLoop.max_iterations}</span>
        <span className="text-muted-foreground">
          ({Math.round(progress)}%)
        </span>
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {loopExecutions.map((loop) => {
        const progress = loop.max_iterations > 0
          ? (loop.iteration_count / loop.max_iterations) * 100
          : 0

        const StatusIcon = {
          pending: Loader2,
          running: Loader2,
          completed: CheckCircle2,
          failed: XCircle
        }[loop.status]

        const statusColor = {
          pending: 'text-muted-foreground',
          running: 'text-blue-500',
          completed: 'text-green-500',
          failed: 'text-red-500'
        }[loop.status]

        const elapsedTime = loop.completed_at
          ? new Date(loop.completed_at).getTime() - new Date(loop.started_at).getTime()
          : Date.now() - new Date(loop.started_at).getTime()

        const elapsedSeconds = Math.floor(elapsedTime / 1000)
        const estimatedTotalSeconds = loop.iteration_count > 0
          ? (elapsedSeconds / loop.iteration_count) * loop.max_iterations
          : 0
        const remainingSeconds = Math.max(0, estimatedTotalSeconds - elapsedSeconds)

        return (
          <Card key={loop.id} className="p-4">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon
                    className={cn(
                      "h-5 w-5",
                      statusColor,
                      loop.status === 'running' && "animate-spin"
                    )}
                  />
                  <span className="font-medium">Loop Execution</span>
                </div>
                <span className={cn("text-sm font-medium capitalize", statusColor)}>
                  {loop.status}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Iteration {loop.iteration_count} of {loop.max_iterations}
                  </span>
                  <span className="font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* Time Estimates */}
              {loop.status === 'running' && remainingSeconds > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Elapsed: {elapsedSeconds}s
                  </span>
                  <span>
                    Remaining: ~{remainingSeconds}s
                  </span>
                </div>
              )}

              {/* Current Item */}
              {loop.current_item_index !== null && loop.loop_data?.results && (
                <div className="text-xs text-muted-foreground">
                  Processing item #{loop.current_item_index + 1}
                </div>
              )}

              {/* Error Message */}
              {loop.error_message && (
                <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
                  {loop.error_message}
                </div>
              )}

              {/* Completion Time */}
              {loop.completed_at && (
                <div className="text-xs text-muted-foreground">
                  Completed in {elapsedSeconds}s
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
