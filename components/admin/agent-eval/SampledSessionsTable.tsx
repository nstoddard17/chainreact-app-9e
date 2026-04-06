"use client"

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { SampledSession } from '@/lib/eval/agentEvalTypes'

interface SampledSessionsTableProps {
  sessions: SampledSession[]
  onSessionClick: (session: SampledSession) => void
}

const outcomeStyles: Record<string, { label: string; className: string }> = {
  activated: {
    label: 'Activated',
    className: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300',
  },
  blocked: {
    label: 'Blocked',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300',
  },
  abandoned: {
    label: 'Abandoned',
    className: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  },
}

export function SampledSessionsTable({ sessions, onSessionClick }: SampledSessionsTableProps) {
  if (sessions.length === 0) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sampled Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sampled sessions in this period</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Sampled Sessions</CardTitle>
        <p className="text-xs text-muted-foreground">~10% of conversations, click to view details</p>
      </CardHeader>
      <CardContent>
        <div className="max-h-[300px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Prompt</TableHead>
                <TableHead className="text-xs">Nodes</TableHead>
                <TableHead className="text-xs">Context</TableHead>
                <TableHead className="text-xs">Issues</TableHead>
                <TableHead className="text-xs">Corrections</TableHead>
                <TableHead className="text-xs">Severity</TableHead>
                <TableHead className="text-xs">Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => {
                const outcome = outcomeStyles[session.outcome] || outcomeStyles.abandoned

                return (
                  <TableRow
                    key={session.conversation_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSessionClick(session)}
                  >
                    <TableCell className="text-xs tabular-nums py-2">
                      {session.date.substring(5, 10)}
                    </TableCell>
                    <TableCell className="text-xs py-2 max-w-[200px] truncate">
                      {session.prompt_preview || '[not sampled]'}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums py-2">
                      {session.node_count}
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      {session.context_type}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums py-2">
                      {session.quality_event_count}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums py-2">
                      {session.correction_count}
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      {session.max_severity || '-'}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className={`text-[10px] ${outcome.className}`}>
                        {outcome.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
