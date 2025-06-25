"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Play, CheckCircle, XCircle, Clock } from "lucide-react"

export interface ExecutionEvent {
  id: string
  event_type: string
  node_id?: string
  event_data: any
  timestamp: string
}

interface ExecutionMonitorProps {
  events: ExecutionEvent[]
}

export function ExecutionMonitor({ events }: ExecutionMonitorProps) {
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "node_start":
        return <Play className="w-3 h-3" />
      case "node_complete":
        return <CheckCircle className="w-3 h-3 text-green-600" />
      case "node_error":
        return <XCircle className="w-3 h-3 text-red-600" />
      default:
        return <Clock className="w-3 h-3" />
    }
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "running":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <Card className="w-80 max-h-96">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Play className="w-4 h-4" />
          Live Execution
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-64">
          <div className="space-y-2">
            {events
              .slice(-10)
              .reverse()
              .map((event) => (
                <div key={event.id} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50">
                  <div className="mt-0.5">{getEventIcon(event.event_type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className={`text-xs ${getStatusColor(event.event_type)}`}>
                        {event.event_type.replace("_", " ")}
                      </Badge>
                      {event.node_id && <span className="text-xs text-slate-500 truncate">{event.node_id}</span>}
                    </div>
                    <div className="text-xs text-slate-600">{new Date(event.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            {events.length === 0 && (
              <div className="text-center text-sm text-slate-500 py-8">No execution events yet</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
