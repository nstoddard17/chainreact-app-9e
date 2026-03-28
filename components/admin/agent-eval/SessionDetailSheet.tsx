"use client"

import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
import type { SampledSession, SessionEvent, AgentEvalEventName } from '@/lib/eval/agentEvalTypes'
import { LightningLoader } from '@/components/ui/lightning-loader'

interface SessionDetailSheetProps {
  session: SampledSession | null
  open: boolean
  onClose: () => void
}

const categoryColors: Record<string, string> = {
  funnel: 'text-blue-600 dark:text-blue-400',
  quality: 'text-red-600 dark:text-red-400',
  drafting: 'text-purple-600 dark:text-purple-400',
  trust: 'text-yellow-600 dark:text-yellow-400',
}

const outcomeStyles: Record<string, { label: string; className: string }> = {
  activated: { label: 'Activated', className: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300' },
  blocked: { label: 'Blocked', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300' },
  abandoned: { label: 'Abandoned', className: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300' },
}

export function SessionDetailSheet({ session, open, onClose }: SessionDetailSheetProps) {
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!session || !open) return

    const fetchEvents = async () => {
      setLoading(true)
      try {
        const response = await fetchWithTimeout(
          `/api/admin/agent-eval/dashboard?conversation_id=${session.conversation_id}&detail=true`,
          {},
          10000
        )
        if (response.ok) {
          const data = await response.json()
          setEvents(data.events || [])
        }
      } catch {
        // best effort
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
  }, [session, open])

  if (!session) return null

  const outcome = outcomeStyles[session.outcome] || outcomeStyles.abandoned

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[500px] sm:w-[600px] overflow-y-auto">
        <SheetHeader className="space-y-3">
          <SheetTitle>Session Detail</SheetTitle>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className={outcome.className}>{outcome.label}</Badge>
            <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
              {session.agent_version}
            </Badge>
            {session.planner_path && (
              <Badge variant="outline">{session.planner_path}</Badge>
            )}
            {session.turns_to_success && (
              <Badge variant="outline">{session.turns_to_success} turns</Badge>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Header info */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Conversation</span>
              <span className="font-mono text-xs">{session.conversation_id.substring(0, 12)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{session.date.substring(0, 16).replace('T', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Context Type</span>
              <span>{session.context_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nodes</span>
              <span>{session.node_count}</span>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1">Prompt</h4>
            <div className="bg-muted/30 rounded-md p-3 text-sm">
              {session.prompt_preview || '[not sampled]'}
            </div>
          </div>

          {/* Event Timeline */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Event Timeline</h4>
            {loading ? (
              <div className="flex justify-center py-4">
                <LightningLoader size="sm" color="primary" />
              </div>
            ) : events.length > 0 ? (
              <div className="space-y-1">
                {events.map((event, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs py-1 border-l-2 border-muted pl-3">
                    <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                      {event.timestamp.substring(11, 19)}
                    </span>
                    <span className={`font-medium ${categoryColors[event.category] || ''}`}>
                      {event.event_name.replace('agent.', '')}
                    </span>
                    <span className="text-muted-foreground truncate">{event.detail}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Event timeline available after detail API is implemented
              </p>
            )}
          </div>

          {/* Quality Events Summary */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1">Quality Events</h4>
            {session.quality_event_count === 0 ? (
              <p className="text-sm text-green-600 dark:text-green-400">(none)</p>
            ) : (
              <div className="text-sm">
                <p>{session.correction_count} corrections, {session.quality_event_count} total quality events</p>
                {session.max_severity && (
                  <p className="text-xs text-muted-foreground">Max severity: {session.max_severity}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
