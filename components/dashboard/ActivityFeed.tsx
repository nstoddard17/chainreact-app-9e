"use client"

import { useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Play, Pause, Check, AlertCircle, Clock } from "lucide-react"
import { useAnalyticsStore } from "@/stores/analyticsStore"
import { useWorkflowStore } from "@/stores/workflowStore"

type ActivityStatus = "completed" | "paused" | "failed" | "active"

const statusIcons: Record<ActivityStatus, React.ReactElement> = {
  completed: <Check className="w-4 h-4 text-green-500" />,
  paused: <Pause className="w-4 h-4 text-yellow-500" />,
  failed: <AlertCircle className="w-4 h-4 text-red-500" />,
  active: <Play className="w-4 h-4 text-blue-500" />,
}

// Helper function to format time ago
function formatTimeAgo(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours} hour${hours > 1 ? 's' : ''} ago`
  } else {
    const days = Math.floor(diffInSeconds / 86400)
    return `${days} day${days > 1 ? 's' : ''} ago`
  }
}

// Helper function to map execution status to activity status
function mapExecutionStatus(status: string): ActivityStatus {
  switch (status) {
    case 'success':
      return 'completed'
    case 'running':
      return 'active'
    case 'error':
      return 'failed'
    case 'pending':
      return 'paused'
    default:
      return 'paused'
  }
}

export default function ActivityFeed() {
  const { executions, fetchExecutions, loading } = useAnalyticsStore()
  const { workflows } = useWorkflowStore()

  useEffect(() => {
    fetchExecutions()
  }, [fetchExecutions])

  // Create a map of workflow IDs to names for quick lookup
  const workflowMap = new Map(workflows.map((w: any) => [w.id, w.name]))

  // Transform executions to activities and sort by most recent
  const activities = executions
    .map((execution: any) => ({
      id: execution.id,
      type: "execution",
      workflow: workflowMap.get(execution.id) || `Workflow ${execution.id.slice(0, 8)}`,
      status: mapExecutionStatus(execution.status),
      time: formatTimeAgo(execution.started_at),
      execution
    }))
    .sort((a: any, b: any) => new Date(b.execution.started_at).getTime() - new Date(a.execution.started_at).getTime())
    .slice(0, 5) // Show only the 5 most recent activities

  return (
    <Card className="bg-white rounded-2xl shadow-lg border border-slate-200 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-slate-900">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {activities.map((activity) => (
              <li key={activity.id} className="flex items-start space-x-4">
                <div className="mt-1 flex-shrink-0">{statusIcons[activity.status]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{activity.workflow}</p>
                  <div className="flex items-center text-xs text-slate-500 mt-1">
                    <Clock className="w-3 h-3 mr-1.5" />
                    <span>{activity.time}</span>
                  </div>
                </div>
                <div
                  className={`w-24 text-center px-2 py-1 rounded-full text-xs font-medium capitalize ${
                    activity.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : activity.status === "paused"
                        ? "bg-yellow-100 text-yellow-700"
                        : activity.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {activity.status}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
