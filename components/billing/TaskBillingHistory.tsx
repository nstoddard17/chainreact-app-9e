"use client"

import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, ChevronDown, Zap, RotateCcw, Sparkles, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { fetchWithTimeout } from "@/lib/utils/fetch-with-timeout"

interface BillingEvent {
  id: string
  createdAt: string
  eventType: string
  source: string
  tasksCharged: number
  balanceAfter: number
  tasksLimit: number
  workflowId: string | null
  workflowName: string | null
  executionId: string | null
  isRetry: boolean
  originalExecutionId: string | null
  nodeBreakdown: Record<string, number> | null
  metadata: {
    flatCost: number | null
    chargedCost: number | null
    loopExpansionEnabled: boolean | null
    loopDetails: any[]
    mode: string | null
  }
}

const SOURCE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  execution: { label: "Execution", color: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300", icon: Zap },
  retry: { label: "Retry", color: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300", icon: RotateCcw },
  ai_creation: { label: "AI Creation", color: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300", icon: Sparkles },
  reset: { label: "Period Reset", color: "bg-gray-100 text-gray-800 dark:bg-gray-500/20 dark:text-gray-300", icon: RefreshCw },
}

export function TaskBillingHistory() {
  const [events, setEvents] = useState<BillingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchEvents = useCallback(async (cursor?: string) => {
    const isLoadMore = !!cursor
    if (isLoadMore) setLoadingMore(true)
    else setLoading(true)

    try {
      const params = new URLSearchParams({ limit: '25' })
      if (cursor) params.set('cursor', cursor)
      if (sourceFilter !== 'all') params.set('source', sourceFilter)

      const response = await fetchWithTimeout(
        `/api/billing/task-history?${params}`,
        { method: 'GET' },
        10000
      )

      if (!response.ok) return

      const data = await response.json()

      if (isLoadMore) {
        setEvents(prev => [...prev, ...data.events])
      } else {
        setEvents(data.events)
      }
      setNextCursor(data.nextCursor)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [sourceFilter])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const getSourceConfig = (source: string) => {
    return SOURCE_CONFIG[source] || SOURCE_CONFIG.execution
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            <SelectItem value="execution">Executions</SelectItem>
            <SelectItem value="retry">Retries</SelectItem>
            <SelectItem value="ai_creation">AI Creation</SelectItem>
            <SelectItem value="reset">Period Resets</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No billing events found</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Workflow</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => {
                const config = getSourceConfig(event.source)
                const Icon = config.icon
                const isExpanded = expandedId === event.id
                const hasBreakdown = event.nodeBreakdown && Object.keys(event.nodeBreakdown).length > 0

                return (
                  <TableRow key={event.id} className="group">
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(event.createdAt), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("gap-1", config.color)}>
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </Badge>
                      {event.isRetry && event.originalExecutionId && (
                        <span className="text-xs text-muted-foreground ml-1">
                          of {event.originalExecutionId.slice(0, 12)}...
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.workflowName || (event.workflowId ? event.workflowId.slice(0, 8) + "..." : "-")}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {event.eventType === 'period_reset' ? (
                        <span className="text-muted-foreground">reset</span>
                      ) : (
                        <span>{event.tasksCharged}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                      {event.balanceAfter === -1 ? "unlimited" : event.balanceAfter}
                    </TableCell>
                    <TableCell>
                      {hasBreakdown && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setExpandedId(isExpanded ? null : event.id)}
                        >
                          <ChevronDown className={cn(
                            "w-3 h-3 transition-transform",
                            isExpanded && "rotate-180"
                          )} />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Expanded breakdown - rendered outside table for layout */}
      {expandedId && (() => {
        const event = events.find(e => e.id === expandedId)
        if (!event?.nodeBreakdown) return null

        return (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Node Breakdown</div>
            <div className="space-y-1">
              {Object.entries(event.nodeBreakdown).map(([nodeId, cost]) => (
                <div key={nodeId} className="flex justify-between text-xs px-2 py-0.5">
                  <span className="text-muted-foreground truncate max-w-[250px]">{nodeId.slice(0, 16)}</span>
                  <span className="font-medium tabular-nums">{cost} task{cost !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
            {event.metadata.loopDetails.length > 0 && (
              <>
                <div className="text-xs font-medium text-muted-foreground mt-3">Loop Details</div>
                {event.metadata.loopDetails.map((loop: any, i: number) => (
                  <div key={i} className="text-xs text-muted-foreground px-2">
                    Loop: {loop.innerCost} task{loop.innerCost !== 1 ? "s" : ""} x {loop.maxIterations} iter = {loop.expandedCost} tasks
                  </div>
                ))}
              </>
            )}
            {event.metadata.flatCost != null && event.metadata.chargedCost != null && event.metadata.flatCost !== event.metadata.chargedCost && (
              <div className="text-xs text-amber-600 dark:text-amber-400 px-2 mt-2">
                Flat cost: {event.metadata.flatCost} - Charged (worst-case): {event.metadata.chargedCost}
              </div>
            )}
          </div>
        )
      })()}

      {/* Load More */}
      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchEvents(nextCursor)}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Load More
          </Button>
        </div>
      )}
    </div>
  )
}
