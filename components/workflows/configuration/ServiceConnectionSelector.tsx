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
import { CheckCircle, AlertCircle, RefreshCw, ExternalLink, Plus, Users, Building2, User } from 'lucide-react'
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
  isLoading = false,
  className,
  autoFetch = true,
}: ServiceConnectionSelectorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [fetchedConnections, setFetchedConnections] = useState<Connection[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

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
  const hasError = connection?.status === 'error'
  const isDisconnected = !connection || connection.status === 'disconnected'

  // Debug logging
  React.useEffect(() => {
    if (connection) {
      logger.debug('[ServiceConnectionSelector] Current connection data:', {
        id: connection.id,
        email: connection.email,
        username: connection.username,
        accountName: connection.accountName,
        account_name: connection.account_name,
        display: getAccountDisplay(connection)
      })
    }
  }, [connection])

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
        return <User className="w-3 h-3" />
      case 'team':
        return <Users className="w-3 h-3" />
      case 'organization':
        return <Building2 className="w-3 h-3" />
      default:
        return null
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

  // Get workspace badge color
  const getWorkspaceBadgeClass = (workspaceType?: string) => {
    switch (workspaceType) {
      case 'personal':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800/50'
      case 'team':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800/50'
      case 'organization':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/50'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800/50'
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

  // Format options for Combobox
  const comboboxOptions: ComboboxOption[] = connections.map((conn) => ({
    value: conn.id,
    label: (
      <div className="flex items-center gap-2 py-1 w-full">
        <span className="font-medium text-sm truncate">
          {getAccountDisplay(conn)}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] h-4 px-1.5 font-medium border flex-shrink-0",
            getWorkspaceBadgeClass(conn.workspace_type)
          )}
        >
          {getWorkspaceIcon(conn.workspace_type)}
          <span className="ml-1">{getWorkspaceLabel(conn.workspace_type)}</span>
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] h-4 px-1.5 font-medium border flex-shrink-0",
            getStatusBadgeClass(conn.status)
          )}
        >
          {conn.status === 'connected' ? 'Active' :
           conn.status === 'error' ? 'Error' :
           conn.status === 'pending' ? 'Pending' : 'Disconnected'}
        </Badge>
      </div>
    ),
    searchValue: `${getAccountDisplay(conn)} ${getWorkspaceLabel(conn.workspace_type)} ${conn.status}`
  }))

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <StaticIntegrationLogo
          providerId={providerId}
          providerName={providerName}
          className="w-8 h-8"
        />
        <div>
          <h3 className="text-sm font-semibold text-foreground">{providerName}</h3>
          <p className="text-xs text-muted-foreground">Service Connection</p>
        </div>
      </div>

      {/* Connected State */}
      {isConnected && (
        <div className="space-y-3">
          {/* Connection Selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Select Account
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Combobox
                  value={connection?.id || ''}
                  onChange={(value) => onSelectConnection?.(value)}
                  options={comboboxOptions}
                  placeholder="Select an account..."
                  disabled={isFetching || connections.length === 0}
                  loading={isFetching}
                  disableSearch={connections.length <= 5}
                />
              </div>
              {onReconnect && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex-shrink-0"
                  title="Refresh connection"
                >
                  <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                </Button>
              )}
            </div>
          </div>

          {/* Add Another Account Button */}
          {onConnect && (
            <Button
              variant="outline"
              size="sm"
              onClick={onConnect}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Another Account
                </>
              )}
            </Button>
          )}

          {/* Help Text */}
          <p className="text-xs text-muted-foreground">
            This action will use the selected {providerName} account.
            {hasMultipleConnections && ` ${connections.length} connections available.`}
          </p>
        </div>
      )}

      {/* Error State */}
      {hasError && (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {connection?.error || 'There was a problem with your connection. Please reconnect.'}
            </AlertDescription>
          </Alert>

          {onReconnect && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onReconnect}
              className="w-full"
            >
              Reconnect
            </Button>
          )}
        </div>
      )}

      {/* Disconnected/Not Connected State */}
      {isDisconnected && (
        <div className="space-y-3">
          <div className="rounded-lg border border-dashed border-border/50 p-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Connect your {providerName} account to continue
            </p>
            {onConnect && (
              <Button
                variant="default"
                size="sm"
                onClick={onConnect}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Connect {providerName}
                  </>
                )}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            You'll need to authorize ChainReact to access your {providerName} account.
            This is secure and can be revoked anytime.
          </p>
        </div>
      )}

      {/* Fetch Error */}
      {fetchError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Failed to load connections: {fetchError}
          </AlertDescription>
        </Alert>
      )}
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
 * />
 *
 * Features:
 * - Professional Combobox dropdown with rich connection details
 * - Displays: Email/Username, Connection Type (Personal/Team/Organization), Status
 * - Auto-fetches all available connections for the provider
 * - Shows workspace type badges with icons
 * - Color-coded status indicators
 * - Multi-connection support with easy switching
 * - Connection health monitoring
 * - Clean, modern design with proper visual hierarchy
 */
