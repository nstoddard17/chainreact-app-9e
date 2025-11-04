"use client"

/**
 * ServiceConnectionSelector Component
 *
 * Enhanced service/account connection selector with:
 * - Connection status indicator
 * - Account details (email/username)
 * - Provider branding
 * - Quick actions (Change, Connect, Reconnect)
 * - Connection health monitoring
 */

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CheckCircle, AlertCircle, RefreshCw, ExternalLink, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Connection {
  id: string
  email?: string
  username?: string
  accountName?: string
  status: 'connected' | 'disconnected' | 'error' | 'refreshing'
  lastChecked?: Date
  error?: string
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
}

export function ServiceConnectionSelector({
  providerId,
  providerName,
  connections = [],
  selectedConnection,
  onSelectConnection,
  onConnect,
  onReconnect,
  isLoading = false,
  className,
}: ServiceConnectionSelectorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const connection = selectedConnection
  const hasMultipleConnections = connections.length > 1
  const connectedConnections = connections.filter(c => c.status === 'connected')
  const hasConnectedAccounts = connectedConnections.length > 0

  const isConnected = connection?.status === 'connected'
  const hasError = connection?.status === 'error'
  const isDisconnected = !connection || connection.status === 'disconnected'

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
  const getAccountDisplay = () => {
    if (!connection) return null
    return connection.email || connection.username || connection.accountName || 'Connected Account'
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Service Connection
        </div>

        {/* Connected State */}
        {isConnected && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 border border-border/50 rounded-lg hover:border-border transition-colors">
              {/* Provider Logo */}
              <div className="flex-shrink-0">
                <StaticIntegrationLogo
                  providerId={providerId}
                  providerName={providerName}
                  className="w-10 h-10"
                />
              </div>

              {/* Connection Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {providerName}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-5 px-2 bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800/50">
                    <CheckCircle className="w-2.5 h-2.5 mr-1" />
                    Connected
                  </Badge>
                </div>

                {/* Account Selector or Display */}
                {hasMultipleConnections ? (
                  <Select
                    value={connection?.id}
                    onValueChange={onSelectConnection}
                  >
                    <SelectTrigger className="h-7 w-full text-xs border-0 bg-transparent p-0 hover:bg-accent/50 focus:ring-0">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground truncate">
                            {getAccountDisplay()}
                          </span>
                          {connection.lastChecked && (
                            <span className="text-[10px] text-muted-foreground/60">
                              • Verified {formatLastChecked(connection.lastChecked)}
                            </span>
                          )}
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {connections.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs">
                              {conn.email || conn.username || conn.accountName || 'Account'}
                            </span>
                            {conn.status === 'connected' && (
                              <CheckCircle className="w-3 h-3 text-green-600" />
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground truncate">
                      {getAccountDisplay()}
                    </span>
                    {connection.lastChecked && (
                      <span className="text-[10px] text-muted-foreground/60">
                        • Verified {formatLastChecked(connection.lastChecked)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {onReconnect && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="h-8 px-3"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                  </Button>
                )}
              </div>
            </div>

            {/* Add Another Account Button - Always visible when connected */}
            {onConnect && (
              <Button
                variant="outline"
                size="sm"
                onClick={onConnect}
                disabled={isLoading}
                className="w-full h-9"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 mr-2" />
                    Add Another Account
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Error State */}
        {hasError && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 border border-red-200 dark:border-red-800/50 rounded-lg">
              <div className="flex-shrink-0">
                <StaticIntegrationLogo
                  providerId={providerId}
                  providerName={providerName}
                  className="w-10 h-10 opacity-50"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {providerName}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-5 px-2 bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800/50">
                    <AlertCircle className="w-2.5 h-2.5 mr-1" />
                    Connection Error
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {getAccountDisplay() || 'Authentication failed'}
                </span>
              </div>

              {onReconnect && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onReconnect}
                  className="h-8 flex-shrink-0"
                >
                  Reconnect
                </Button>
              )}
            </div>

            {connection.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {connection.error}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Disconnected/Not Connected State */}
        {isDisconnected && (
          <div className="flex items-center gap-3 p-3 border border-border/50 border-dashed rounded-lg">
            <div className="flex-shrink-0">
              <StaticIntegrationLogo
                providerId={providerId}
                providerName={providerName}
                className="w-10 h-10 opacity-40"
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-foreground">
                  {providerName}
                </span>
                <Badge variant="outline" className="text-[10px] h-5 px-2 text-muted-foreground border-border/50">
                  Not Connected
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Connect your {providerName} account to continue
              </span>
            </div>

            {onConnect && (
              <Button
                variant="default"
                size="sm"
                onClick={onConnect}
                disabled={isLoading}
                className="h-8 flex-shrink-0"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-3.5 h-3.5 mr-2" />
                    Connect
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Help Text */}
      <p className="text-xs text-slate-500 dark:text-slate-500">
        {isConnected ? (
          <>
            This action will use your connected {providerName} account. You can change it anytime.
          </>
        ) : isDisconnected ? (
          <>
            You'll need to authorize ChainReact to access your {providerName} account. This is secure and can be revoked anytime.
          </>
        ) : (
          <>
            There was a problem with your {providerName} connection. Please reconnect to continue.
          </>
        )}
      </p>
    </div>
  )
}

/**
 * Format last checked timestamp to human-readable format
 */
function formatLastChecked(date: Date): string {
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
 * const [connection] = useState<Connection>({
 *   id: 'conn-123',
 *   email: 'user@example.com',
 *   status: 'connected',
 *   lastChecked: new Date()
 * })
 *
 * <ServiceConnectionSelector
 *   providerId="gmail"
 *   providerName="Gmail"
 *   connection={connection}
 *   onChangeAccount={() => openAccountPicker()}
 *   onConnect={() => initiateOAuth()}
 *   onReconnect={() => refreshConnection()}
 * />
 */
