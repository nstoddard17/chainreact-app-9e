"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Users, Check, X, Clock, Loader2, AlertCircle, Mail } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { logger } from "@/lib/utils/logger"

interface Notification {
  id: string
  type: string
  title: string
  message: string
  action_url?: string
  action_label?: string
  metadata?: any
  is_read: boolean
  created_at: string
}

export function NotificationDropdown() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [processingNotification, setProcessingNotification] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications?unread=true')
      if (response.ok) {
        const { notifications: data } = await response.json()
        logger.debug('Fetched notifications:', { count: data?.length || 0, notifications: data })
        setNotifications(data || [])
      } else {
        logger.error('Failed to fetch notifications:', { status: response.status })
      }
    } catch (error) {
      logger.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    logger.debug('NotificationDropdown mounted - fetching notifications...')
    fetchNotifications()

    // Check periodically for new notifications
    const interval = setInterval(() => {
      fetchNotifications()
    }, 30000) // Check every 30 seconds

    return () => clearInterval(interval)
  }, [])

  const handleAcceptInvitation = async (notification: Notification, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      setProcessingNotification(notification.id)
      const invitationId = notification.metadata?.invitation_id

      const response = await fetch(`/api/teams/invitations/${invitationId}`, {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()

        // Check if error is due to free plan
        if (response.status === 403 && error.error?.includes('upgrade')) {
          toast.error('You need to upgrade to a Pro plan or higher to join teams')
          // Redirect to upgrade page
          router.push('/settings/billing')
          return
        }

        throw new Error(error.error || 'Failed to accept invitation')
      }

      const { team } = await response.json()
      toast.success(`Welcome to ${team.name}!`)

      // Refresh notifications
      fetchNotifications()

      // Redirect to team page
      router.push(`/teams`)
    } catch (error) {
      logger.error('Error accepting invitation:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to accept invitation')
    } finally {
      setProcessingNotification(null)
    }
  }

  const handleDeclineInvitation = async (notification: Notification, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      setProcessingNotification(notification.id)
      const invitationId = notification.metadata?.invitation_id

      const response = await fetch(`/api/teams/invitations/${invitationId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to decline invitation')
      }

      toast.success('Invitation declined')

      // Refresh notifications
      fetchNotifications()
    } catch (error) {
      logger.error('Error declining invitation:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to decline invitation')
    } finally {
      setProcessingNotification(null)
    }
  }

  const handleLater = async (notification: Notification, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Just close the dropdown - notification stays unread
  }

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: [notificationId] })
      })

      if (response.ok) {
        fetchNotifications()
      }
    } catch (error) {
      logger.error('Error marking notification as read:', error)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'team_invitation':
        return <Users className="w-4 h-4 text-blue-600" />
      case 'workflow_shared':
        return <Mail className="w-4 h-4 text-green-600" />
      case 'execution_failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />
      case 'integration_disconnected':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />
      default:
        return <Bell className="w-4 h-4 text-gray-600" />
    }
  }

  const getNotificationBgColor = (type: string) => {
    switch (type) {
      case 'team_invitation':
        return 'bg-blue-100'
      case 'workflow_shared':
        return 'bg-green-100'
      case 'execution_failed':
        return 'bg-red-100'
      case 'integration_disconnected':
        return 'bg-yellow-100'
      default:
        return 'bg-gray-100'
    }
  }

  const totalCount = notifications.length
  const hasNotifications = totalCount > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={`h-4 w-4 ${hasNotifications ? 'text-yellow-500 animate-pulse' : 'text-gray-400'}`} />
          {hasNotifications && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
              {totalCount > 9 ? '9+' : totalCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-96 bg-gray-900/95 backdrop-blur-sm border border-gray-700 max-h-[32rem]">
        <div className="px-3 py-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Bell className="h-4 w-4 text-yellow-500" />
            Notifications ({totalCount})
          </h3>
        </div>
        <DropdownMenuSeparator className="bg-gray-700" />

        <div className="max-h-96 overflow-y-auto">
          {/* Empty State */}
          {totalCount === 0 && !loading && (
            <div className="px-6 py-8 text-center">
              <Bell className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No notifications</p>
              <p className="text-xs text-gray-500 mt-1">You're all caught up!</p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="px-6 py-8 text-center">
              <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-3 animate-spin" />
              <p className="text-sm text-gray-400">Loading notifications...</p>
            </div>
          )}

          {/* Team Invitations - Special handling with action buttons */}
          {notifications.filter(n => n.type === 'team_invitation').map((notification) => (
            <div
              key={notification.id}
              className="px-3 py-3 border-b border-gray-700 last:border-b-0 hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className={`w-8 h-8 rounded-full ${getNotificationBgColor(notification.type)} flex items-center justify-center flex-shrink-0 mt-1`}>
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{notification.title}</p>
                  <p className="text-xs text-gray-300 mt-1">{notification.message}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                      onClick={(e) => handleAcceptInvitation(notification, e)}
                      disabled={processingNotification === notification.id}
                    >
                      {processingNotification === notification.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-3 h-3 mr-1" />
                          Accept
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-gray-600 hover:bg-gray-700"
                      onClick={(e) => handleDeclineInvitation(notification, e)}
                      disabled={processingNotification === notification.id}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-gray-400 hover:text-white hover:bg-gray-700"
                      onClick={(e) => handleLater(notification, e)}
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      Later
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* All Other Notifications - Standard clickable items */}
          {notifications.filter(n => n.type !== 'team_invitation').map((notification) => (
            <div
              key={notification.id}
              className="border-b border-gray-700 last:border-b-0"
            >
              <div
                className="px-3 py-3 hover:bg-gray-800 transition-colors cursor-pointer"
                onClick={() => {
                  if (notification.action_url) {
                    handleMarkAsRead(notification.id)
                    router.push(notification.action_url)
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-8 h-8 rounded-full ${getNotificationBgColor(notification.type)} flex items-center justify-center flex-shrink-0 mt-1`}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{notification.title}</p>
                    <p className="text-xs text-gray-300 mt-1">{notification.message}</p>
                    {notification.action_label && (
                      <p className="text-xs text-blue-400 mt-2">{notification.action_label}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {hasNotifications && (
          <>
            <DropdownMenuSeparator className="bg-gray-700" />
            <div className="px-3 py-2 flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 text-gray-300 hover:text-white hover:bg-gray-700"
                onClick={async () => {
                  try {
                    await fetch('/api/notifications', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ mark_all: true })
                    })
                    fetchNotifications()
                    toast.success('All notifications marked as read')
                  } catch (error) {
                    logger.error('Error marking all as read:', error)
                  }
                }}
              >
                Mark all as read
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
