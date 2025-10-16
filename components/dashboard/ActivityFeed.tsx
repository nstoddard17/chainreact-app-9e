"use client"

import { useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Play, Pause, Check, AlertCircle, Clock, Link, Link2Off, Plus, Trash2, Edit } from "lucide-react"
import { useActivityStore } from "@/stores/activityStore"

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
  } 
    const days = Math.floor(diffInSeconds / 86400)
    return `${days} day${days > 1 ? 's' : ''} ago`
  
}

// Helper function to get icon for activity type
function getActivityIcon(type: string, status: string) {
  switch (type) {
    case 'workflow_execution':
      return status === 'success' ? <Check className="w-4 h-4 text-green-500" /> :
             status === 'error' ? <AlertCircle className="w-4 h-4 text-red-500" /> :
             status === 'running' ? <Play className="w-4 h-4 text-blue-500" /> :
             <Pause className="w-4 h-4 text-yellow-500" />
    case 'integration_connect':
      return <Link className="w-4 h-4 text-green-500" />
    case 'integration_disconnect':
      return <Link2Off className="w-4 h-4 text-red-500" />
    case 'workflow_create':
      return <Plus className="w-4 h-4 text-blue-500" />
    case 'workflow_delete':
      return <Trash2 className="w-4 h-4 text-red-500" />
    case 'workflow_update':
      return <Edit className="w-4 h-4 text-purple-500" />
    default:
      return <Clock className="w-4 h-4 text-gray-500" />
  }
}

// Helper function to get status color
function getStatusColor(status: string) {
  switch (status) {
    case 'success':
      return 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
    case 'error':
      return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
    case 'running':
      return 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
    case 'pending':
      return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
    default:
      return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
  }
}

export default function ActivityFeed() {
  const { activities, fetchActivities, loading } = useActivityStore()

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  return (
    <Card className="bg-card rounded-2xl shadow-lg border border-border">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-semibold text-card-foreground">Your Recent Activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {activities.slice(0, 5).map((activity) => (
              <li key={activity.id} className="flex items-start space-x-4">
                <div className="mt-1 flex-shrink-0">
                  {getActivityIcon(activity.type, activity.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-card-foreground break-words">{activity.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{activity.description}</p>
                  <div className="flex items-center text-xs text-muted-foreground mt-1">
                    <Clock className="w-3 h-3 mr-1.5" />
                    <span>{formatTimeAgo(activity.timestamp)}</span>
                  </div>
                </div>
                <div
                  className={`w-20 text-center px-2 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(activity.status)}`}
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
