"use client"

/**
 * ServiceConnectionSelector Component
 *
 * Professional service/account connection selector with:
 * - Combobox dropdown with rich connection details
 * - Connection status indicator
 * - Account details (email/username)
 * - Workspace type badges (Personal/Team/Organization)
 * - Provider branding
 * - Quick actions (Connect, Add Another Account)
 * - Connection health monitoring
 */

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CheckCircle, AlertCircle, RefreshCw, ExternalLink, Plus, Users, Building2, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
import { logger } from '@/lib/utils/logger'

interface Connection {
  id: string
  provider: string
  email?: string
  username?: string
  accountName?: string
  account_name?: string
  avatar_url?: string
  status: 'connected' | 'disconnected' | 'error' | 'refreshing' | 'pending'
  lastChecked?: Date
  error?: string
  workspace_type?: 'personal' | 'team' | 'organization'
  workspace_id?: string | null
  user_permission?: 'use' | 'manage' | 'admin'
  created_at?: string
  expires_at?: string | null
}

interface ServiceConnectionSelectorProps {
  /** Integration/provider ID (e.g., 'gmail', 'slack') */
  providerId: string
  /** Human-readable provider name */
  providerName: string
  /** All available connections for this provider */
  connections?: Connection[]
  /** Currently selected connection */
  selectedConnection?: Connection
  /** Callback when user selects a different connection */
  onSelectConnection?: (connectionId: string) => void
  /** Callback when user wants to connect new account */
  onConnect?: () => void
  /** Callback when user wants to reconnect */
  onReconnect?: () => void
  /** Callback when user wants to delete a connection */
  onDeleteConnection?: (connectionId: string) => void
  /** Whether the component is in a loading state */
  isLoading?: boolean
  /** Custom className */
  className?: string
  /** Auto-fetch all connections for this provider */
  autoFetch?: boolean
}

export function ServiceConnectionSelector({
  providerId,
  providerName,
  connections: propConnections,
  selectedConnection: propSelectedConnection,
  onSelectConnection,
  onConnect,
  onReconnect,
  onDeleteConnection,
  isLoading = false,
  className,
  autoFetch = true,
}: ServiceConnectionSelectorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [fetchedConnections, setFetchedConnections] = useState<Connection[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [connectionToDelete, setConnectionToDelete] = useState<Connection | null>(null)

  // Use prop connections if provided, otherwise use fetched connections
  const connections = propConnections || fetchedConnections
  const selectedConnection = propSelectedConnection || (connections.length > 0 ? connections[0] : undefined)

  // Fetch all connections for this provider on mount
  useEffect(() => {
    if (autoFetch && !propConnections && providerId) {
      fetchAllConnections()
    }
  }, [providerId, autoFetch, propConnections])

  const fetchAllConnections = async () => {
    setIsFetching(true)
    setFetchError(null)

    try {
      logger.debug('[ServiceConnectionSelector] Fetching all connections', { providerId })

      const response = await fetchWithTimeout(
        `/api/integrations/all-connections?provider=${encodeURIComponent(providerId)}`,
        {},
        8000
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch connections: ${response.statusText}`)
      }

      const data = await response.json()
      const fetchedConns = data.connections || []

      logger.debug('[ServiceConnectionSelector] Fetched connections', {
        providerId,
        count: fetchedConns.length
      })

      setFetchedConnections(fetchedConns)
    } catch (error: any) {
      logger.error('[ServiceConnectionSelector] Error fetching connections', {
        error: error.message,
        providerId
      })
      setFetchError(error.message)
    } finally {
      setIsFetching(false)
    }
  }

  const connection = selectedConnection
  const hasMultipleConnections = connections.length > 1
  const connectedConnections = connections.filter(c => c.status === 'connected')
  const hasConnectedAccounts = connectedConnections.length > 0

  const isConnected = connection?.status === 'connected'
  const hasError = connection?.status === 'error' || connection?.status === 'disconnected'
  const needsReconnection = connection && (connection.status === 'error' || connection.status === 'disconnected')
  const isDisconnected = !connection || connections.length === 0

  const handleRefresh = async () => {
    if (!onReconnect) return
    setIsRefreshing(true)
    try {
      await onReconnect()
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000)
    }
  }

  // Get account display text
  const getAccountDisplay = (conn?: Connection) => {
    if (!conn) return null
    return conn.email || conn.username || conn.accountName || conn.account_name || 'Connected Account'
  }

  // Get workspace type icon
  const getWorkspaceIcon = (workspaceType?: string) => {
    switch (workspaceType) {
      case 'personal':
        return <User className="w-3.5 h-3.5" />
      case 'team':
        return <Users className="w-3.5 h-3.5" />
      case 'organization':
        return <Building2 className="w-3.5 h-3.5" />
      default:
        return <User className="w-3.5 h-3.5" />
    }
  }

  // Get workspace type label
  const getWorkspaceLabel = (workspaceType?: string) => {
    switch (workspaceType) {
      case 'personal':
        return 'Personal'
      case 'team':
        return 'Team'
      case 'organization':
        return 'Organization'
      default:
        return 'Personal'
    }
  }

  // Get status badge color
  const getStatusBadgeClass = (status?: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800/50'
      case 'error':
        return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800/50'
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800/50'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800/50'
    }
  }

  // Get initials from account name or email
  const getInitials = (conn: Connection): string => {
    const display = getAccountDisplay(conn)
    if (!display) return '?'

    // If it's an email, get first letter of username
    if (display.includes('@')) {
      return display.charAt(0).toUpperCase()
    }

    // If it's a name, get first letters of first and last name
    const parts = display.split(' ')
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
    }

    return display.charAt(0).toUpperCase()
  }

  // Generate consistent color for each account based on email
  const getAvatarColor = (conn: Connection): string => {
    const display = getAccountDisplay(conn) || ''
    const colors = [
      'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
      'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
      'bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300',
      'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
      'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
      'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
      'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
      'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
    ]

    // Simple hash function to consistently assign colors
    let hash = 0
    for (let i = 0; i < display.length; i++) {
      hash = display.charCodeAt(i) + ((hash << 5) - hash)
    }

    return colors[Math.abs(hash) % colors.length]
  }

  // Handle delete confirmation
  const handleDeleteClick = (conn: Connection, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent option selection
    setConnectionToDelete(conn)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (connectionToDelete && onDeleteConnection) {
      onDeleteConnection(connectionToDelete.id)
      setDeleteDialogOpen(false)
      setConnectionToDelete(null)
    }
  }

  // Format options for Combobox
  const comboboxOptions: ComboboxOption[] = connections.map((conn) => {
    // DEBUG: Log avatar data
    if (conn.email) {
      console.log('[ServiceConnectionSelector] Connection data:', {
        id: conn.id,
        email: conn.email,
        avatar_url: conn.avatar_url,
        has_avatar: !!conn.avatar_url
      })
    }

    return {
    value: conn.id,
    label: (
      <div className="flex items-center gap-2 py-1 w-full group">
        {/* Profile Picture / Initials */}
        {conn.avatar_url ? (
          <img
            src={conn.avatar_url}
            alt={getAccountDisplay(conn) || 'Account avatar'}
            className="w-5 h-5 rounded flex-shrink-0 object-cover"
            onError={(e) => {
              // Fallback to initials if image fails to load
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              if (target.nextSibling) {
                (target.nextSibling as HTMLElement).style.display = 'flex'
              }
            }}
          />
        ) : null}
        <div className={cn(
          "w-5 h-5 rounded flex items-center justify-center text-[9px] font-semibold flex-shrink-0",
          getAvatarColor(conn),
          conn.avatar_url && "hidden"
        )}>
          {getInitials(conn)}
        </div>

        <span className="font-medium text-sm truncate flex-1">
          {getAccountDisplay(conn)}
        </span>

        {/* Workspace Type - Icon + Text (Minimal) */}
        <div className="flex items-center gap-1 text-muted-foreground/70 flex-shrink-0">
          {getWorkspaceIcon(conn.workspace_type)}
          <span className="text-[10px] font-medium">
            {getWorkspaceLabel(conn.workspace_type)}
          </span>
        </div>

        {conn.status !== 'connected' && (
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] h-4 px-1.5 font-medium border flex-shrink-0",
              getStatusBadgeClass(conn.status)
            )}
          >
            {conn.status === 'error' ? 'Error' :
             conn.status === 'pending' ? 'Pending' : 'Disconnected'}
          </Badge>
        )}

        {/* Delete button - only show if multiple connections and callback provided */}
        {connections.length > 1 && onDeleteConnection && (
          <button
            onClick={(e) => handleDeleteClick(conn, e)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded flex-shrink-0"
            title="Remove account"
          >
            <X className="w-3.5 h-3.5 text-destructive" />
          </button>
        )}
      </div>
    ),
    searchValue: `${getAccountDisplay(conn)} ${getWorkspaceLabel(conn.workspace_type)} ${conn.status}`
    }
  })

  return (
    <div className={cn("space-y-2", className)}>
      {/* Unified State - Show account selector for all states except no connections */}
      {!isDisconnected && (
        <div className="space-y-2">
          {/* Integration Label */}
          <div className="flex items-center gap-2">
            <StaticIntegrationLogo
              providerId={providerId}
              providerName={providerName}
              className="w-5 h-5 flex-shrink-0"
            />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {providerName} Account
            </span>
          </div>

          {/* Account Selector + Actions */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Combobox
                value={connection?.id || ''}
                onChange={(value) => onSelectConnection?.(value)}
                options={comboboxOptions}
                placeholder="Select account..."
                disabled={isFetching || connections.length === 0}
                loading={isFetching}
                disableSearch={connections.length <= 5}
              />
            </div>

            {/* Smart button: Reconnect if selected account needs it, otherwise Refresh */}
            {onReconnect && (
              <Button
                variant={needsReconnection ? "default" : "outline"}
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={cn(
                  "flex-shrink-0 h-9 px-3 gap-1.5",
                  needsReconnection && "bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
                )}
                title={needsReconnection ? "Reconnect this account" : "Refresh connection"}
              >
                {isRefreshing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs font-medium">
                      {needsReconnection ? "Reconnecting" : "Refreshing"}
                    </span>
                  </>
                ) : needsReconnection ? (
                  <>
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Reconnect</span>
                  </>
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            )}

            {/* Always show Add Account button */}
            {onConnect && (
              <Button
                variant="outline"
                size="icon"
                onClick={onConnect}
                disabled={isLoading}
                className="flex-shrink-0 h-9 w-9"
                title="Add another account"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>

          {/* Subtle status indicator for accounts that need attention */}
          {needsReconnection && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-xs text-amber-900 dark:text-amber-100">
                {connection?.error || 'This account needs to be reconnected to continue working.'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* No Connections State - Only show when truly no accounts exist */}
      {isDisconnected && (
        <div className="flex items-center gap-2">
          <StaticIntegrationLogo
            providerId={providerId}
            providerName={providerName}
            className="w-6 h-6 flex-shrink-0 opacity-40"
          />
          <div className="flex-1 text-xs text-muted-foreground">
            Not connected
          </div>
          {onConnect && (
            <Button
              variant="default"
              size="sm"
              onClick={onConnect}
              disabled={isLoading}
              className="flex-shrink-0 h-9"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Connecting
                </>
              ) : (
                <>
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Connect
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Fetch Error */}
      {fetchError && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs">
            {fetchError}
          </AlertDescription>
        </Alert>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <span className="font-semibold">{getAccountDisplay(connectionToDelete || undefined)}</span>?
              This action cannot be undone and will disconnect this account from all workflows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Format date to human-readable format
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

/**
 * Usage Example:
 *
 * <ServiceConnectionSelector
 *   providerId="gmail"
 *   providerName="Gmail"
 *   autoFetch={true}
 *   onSelectConnection={(connectionId) => console.log('Selected:', connectionId)}
 *   onConnect={() => initiateOAuth()}
 *   onReconnect={() => refreshConnection()}
 *   onDeleteConnection={(connectionId) => handleDelete(connectionId)}
 * />
 *
 * Features:
 * - Unified design across all connection states (connected/disconnected/error)
 * - Always shows account selector when accounts exist (allows switching even when disconnected)
 * - Smart button behavior: "Reconnect" for expired/error accounts, "Refresh" for active accounts
 * - Always shows "Add Account" button for connecting additional accounts
 * - Status badges in dropdown show connection health (Connected/Error/Disconnected/Pending)
 * - Subtle amber warning below selector when selected account needs attention
 * - Rich dropdown: Email, avatar, workspace type (Personal/Team/Org), delete option
 * - Auto-fetches all available connections for the provider
 * - Multi-connection support with easy switching between accounts
 * - Ultra-compact design optimized for space efficiency
 */
