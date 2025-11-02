"use client"

import { useEffect, useState, useRef } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Users,
  Workflow,
  Settings,
  Plug,
  UserPlus,
  UserMinus,
  Play,
  Pause,
  Trash2,
  Edit,
  FileText,
  RefreshCw,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface TeamActivity {
  id: string
  activity_type: string
  description: string
  metadata: Record<string, any>
  created_at: string
  user_id: string | null
  user: {
    id: string
    email: string
    full_name?: string
    username?: string
  } | null
}

interface TeamActivityFeedProps {
  teamId: string
}

export function TeamActivityFeed({ teamId }: TeamActivityFeedProps) {
  const [activities, setActivities] = useState<TeamActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchActivities()
    }
  }, [teamId])

  const fetchActivities = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/teams/${teamId}/activity?limit=20`)

      if (!response.ok) {
        throw new Error('Failed to fetch activity')
      }

      const data = await response.json()
      setActivities(data.activities || [])
    } catch (error: any) {
      console.error('Error fetching team activity:', error)
      setError(error.message || 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'team_created':
      case 'member_joined':
      case 'member_invited':
        return <Users className="w-4 h-4" />
      case 'member_left':
      case 'member_removed':
        return <UserMinus className="w-4 h-4" />
      case 'member_role_changed':
        return <UserPlus className="w-4 h-4" />
      case 'workflow_created':
      case 'workflow_updated':
        return <Workflow className="w-4 h-4" />
      case 'workflow_activated':
        return <Play className="w-4 h-4" />
      case 'workflow_deactivated':
        return <Pause className="w-4 h-4" />
      case 'workflow_deleted':
        return <Trash2 className="w-4 h-4" />
      case 'integration_connected':
      case 'integration_disconnected':
        return <Plug className="w-4 h-4" />
      case 'settings_updated':
      case 'team_renamed':
      case 'team_description_updated':
        return <Settings className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  const getActivityColor = (type: string) => {
    if (type.includes('created') || type.includes('joined') || type.includes('connected')) {
      return 'text-green-600 dark:text-green-400'
    }
    if (type.includes('deleted') || type.includes('removed') || type.includes('disconnected')) {
      return 'text-red-600 dark:text-red-400'
    }
    if (type.includes('updated') || type.includes('changed')) {
      return 'text-blue-600 dark:text-blue-400'
    }
    return 'text-slate-600 dark:text-slate-400'
  }

  const getUserInitials = (user: TeamActivity['user']) => {
    if (!user) return '?'
    if (user.full_name) {
      const names = user.full_name.split(' ')
      return names.map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }
    if (user.email) {
      return user.email[0].toUpperCase()
    }
    return '?'
  }

  const getUserDisplayName = (user: TeamActivity['user']) => {
    if (!user) return 'System'
    return user.full_name || user.username || user.email
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex gap-4">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 space-y-4">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <Button variant="outline" onClick={fetchActivities}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="w-12 h-12 mx-auto text-slate-400 mb-4" />
        <p className="text-sm text-slate-500">No activity yet</p>
        <p className="text-xs text-slate-400 mt-1">
          Team activity will appear here as members collaborate
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {activities.map((activity) => (
        <div key={activity.id} className="flex gap-4">
          {/* User Avatar */}
          <Avatar className="w-10 h-10 flex-shrink-0">
            <AvatarFallback className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {getUserInitials(activity.user)}
            </AvatarFallback>
          </Avatar>

          {/* Activity Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div className={`mt-1 ${getActivityColor(activity.activity_type)}`}>
                {getActivityIcon(activity.activity_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900 dark:text-slate-100">
                  <span className="font-medium">{getUserDisplayName(activity.user)}</span>
                  {' '}
                  <span className="text-slate-600 dark:text-slate-400">
                    {activity.description}
                  </span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                </p>

                {/* Show metadata if available */}
                {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-600">
                    {activity.metadata.workflow_name && (
                      <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                        {activity.metadata.workflow_name}
                      </span>
                    )}
                    {activity.metadata.old_role && activity.metadata.new_role && (
                      <span>
                        {activity.metadata.old_role} → {activity.metadata.new_role}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Load More Button (optional) */}
      {activities.length >= 20 && (
        <div className="text-center pt-4">
          <Button variant="outline" size="sm">
            Load More
          </Button>
        </div>
      )}
    </div>
  )
}
