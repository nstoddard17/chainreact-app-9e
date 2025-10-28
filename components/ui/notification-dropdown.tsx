"use client"

import { useEffect, useState } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useRouter } from "next/navigation"
import { Bell, AlertCircle, Users, Check, X, Clock, Loader2 } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { getProviderDisplayName } from "@/lib/utils/provider-names"
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
  const { integrations } = useIntegrationStore()
  const [integrationIssues, setIntegrationIssues] = useState<Array<{
    id: string
    name: string
    provider: string
    issue: string
  }>>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [processingNotification, setProcessingNotification] = useState<string | null>(null)

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications?unread=true')
      if (response.ok) {
        const { notifications: data } = await response.json()
        setNotifications(data || [])
      }
    } catch (error) {
      logger.error('Error fetching notifications:', error)
    }
  }

  // Check for integration issues
  useEffect(() => {
    const checkIntegrations = () => {
      const now = new Date()
      const issues: typeof integrationIssues = []

      integrations.forEach(integration => {
        // Check database status first
        if (integration.status === 'needs_reauthorization') {
          issues.push({
            id: integration.id,
            name: getProviderDisplayName(integration.provider),
            provider: integration.provider,
            issue: 'Needs reauthorization'
          })
        } else if (integration.status === 'expired') {
          issues.push({
            id: integration.id,
            name: getProviderDisplayName(integration.provider),
            provider: integration.provider,
            issue: 'Connection expired'
          })
        } else if (integration.status === 'connected' && integration.expires_at) {
          // Check if connected integration has expired based on expires_at timestamp
          const expiresAt = new Date(integration.expires_at)
          const expiryTimestamp = expiresAt.getTime()
          const nowTimestamp = now.getTime()

          // If expired (past the expiry time)
          if (expiryTimestamp <= nowTimestamp) {
            issues.push({
              id: integration.id,
              name: getProviderDisplayName(integration.provider),
              provider: integration.provider,
              issue: 'Token expired'
            })
          }
        }
      })

      setIntegrationIssues(issues)
    }

    checkIntegrations()
    fetchNotifications()

    // Check periodically
    const interval = setInterval(() => {
      checkIntegrations()
      fetchNotifications()
    }, 30000) // Check every 30 seconds

    return () => clearInterval(interval)
  }, [integrations])

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

  const totalCount = integrationIssues.length + notifications.length

  // Don't show the bell if there are no issues or notifications
  if (totalCount === 0) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4 text-yellow-500 animate-pulse" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          {totalCount > 0 && (
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
          {/* Team Invitations */}
          {notifications.filter(n => n.type === 'team_invitation').map((notification) => (
            <div
              key={notification.id}
              className="px-3 py-3 border-b border-gray-700 last:border-b-0"
            >
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-1">
                  <Users className="w-4 h-4 text-blue-600" />
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

          {/* Other Notifications */}
          {notifications.filter(n => n.type !== 'team_invitation').map((notification) => (
            <DropdownMenuItem key={notification.id} asChild>
              <Link
                href={notification.action_url || '#'}
                className="flex flex-col gap-1 px-3 py-2 text-gray-200 hover:text-white hover:bg-gray-700"
              >
                <div className="font-medium text-sm">{notification.title}</div>
                <div className="text-xs text-gray-400">{notification.message}</div>
                {notification.action_label && (
                  <div className="text-xs text-blue-400 mt-1">{notification.action_label}</div>
                )}
              </Link>
            </DropdownMenuItem>
          ))}

          {/* Integration Issues */}
          {integrationIssues.length > 0 && (
            <>
              <DropdownMenuSeparator className="bg-gray-700" />
              <div className="px-3 py-2">
                <h4 className="text-xs font-semibold text-gray-400 flex items-center gap-2">
                  <AlertCircle className="h-3 w-3 text-yellow-500" />
                  Integration Issues ({integrationIssues.length})
                </h4>
              </div>
              {integrationIssues.map((issue) => (
                <DropdownMenuItem key={issue.id} asChild>
                  <Link
                    href="/integrations"
                    className="flex flex-col gap-1 px-3 py-2 text-gray-200 hover:text-white hover:bg-gray-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">
                        {issue.name}
                      </span>
                      <span className="text-xs text-yellow-400 whitespace-nowrap">
                        {issue.issue}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      Click to fix this integration
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </div>

        <DropdownMenuSeparator className="bg-gray-700" />
        <div className="px-3 py-2">
          <Button
            size="sm"
            variant="ghost"
            className="w-full text-gray-300 hover:text-white hover:bg-gray-700"
            onClick={() => router.push('/teams')}
          >
            View All Teams
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
