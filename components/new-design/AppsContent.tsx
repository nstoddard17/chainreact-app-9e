"use client"

import { useEffect, useState } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CheckCircle2, Plus, ExternalLink, MoreVertical, Unplug, RefreshCw, Settings, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { logger } from "@/lib/utils/logger"
import { getIntegrationLogoClasses } from "@/lib/integrations/logoStyles"

export function AppsContent() {
  const { providers, integrations, initializeProviders, fetchIntegrations, connectIntegration, setLoading, loading: storeLoading } = useIntegrationStore()
  const { user } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState("")
  const [availableSearchQuery, setAvailableSearchQuery] = useState("")
  const [showConnectDialog, setShowConnectDialog] = useState(false)
  const [loading, setLocalLoading] = useState<Record<string, boolean>>({})
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (user) {
      const loadData = async () => {
        await Promise.all([
          initializeProviders(),
          fetchIntegrations(false)
        ])
        setInitialLoadComplete(true)
      }
      loadData()
    }
  }, [user, initializeProviders, fetchIntegrations])

  const getConnectionStatus = (providerId: string) => {
    return integrations.find(i => i.provider === providerId)
  }

  const handleConnect = async (providerId: string) => {
    if (!user) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to connect integrations.",
        variant: "destructive",
      })
      return
    }

    setLocalLoading(prev => ({ ...prev, [providerId]: true }))

    try {
      // Use the store's connectIntegration method which handles optimistic updates
      const result = await connectIntegration(providerId)

      // Close the dialog to show the newly connected app
      setShowConnectDialog(false)

      // Get provider display name for better toast messaging
      const provider = providers.find(p => p.id === providerId)
      const displayName = provider?.name || providerId

      toast({
        title: "Integration Connected",
        description: `${displayName} connected successfully.`,
      })
    } catch (error: any) {
      logger.error("Connection error:", error)

      // Get provider display name for error message too
      const provider = providers.find(p => p.id === providerId)
      const displayName = provider?.name || providerId

      toast({
        title: "Connection Error",
        description: error?.message || `Failed to connect ${displayName}. Please try again.`,
        variant: "destructive",
      })
    } finally {
      setLocalLoading(prev => ({ ...prev, [providerId]: false }))
    }
  }

  const handleDisconnect = async (integrationId: string, providerName: string) => {
    setLocalLoading(prev => ({ ...prev, [integrationId]: true }))

    try {
      const response = await fetch(`/api/integrations/${integrationId}`, { method: "DELETE" })
      const data = await response.json()

      if (data.success) {
        toast({
          title: "Disconnected",
          description: `${providerName} has been disconnected.`,
        })
        fetchIntegrations(false)
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to disconnect.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setLocalLoading(prev => ({ ...prev, [integrationId]: false }))
    }
  }

  const handleReconnect = async (providerId: string) => {
    handleConnect(providerId)
  }

  // Filter connected apps - only show truly connected (not expired)
  const connectedApps = providers.filter(provider => {
    if (["ai", "logic", "control"].includes(provider.id)) return false
    const connection = getConnectionStatus(provider.id)
    const isConnected = connection?.status === 'connected'
    const matchesSearch = searchQuery === "" ||
      provider.name.toLowerCase().includes(searchQuery.toLowerCase())
    return isConnected && matchesSearch
  }).sort((a, b) => a.name.localeCompare(b.name))

  // Filter apps that need attention (expired or needs reauth)
  const appsNeedingAttention = providers.filter(provider => {
    if (["ai", "logic", "control"].includes(provider.id)) return false
    const connection = getConnectionStatus(provider.id)
    const needsAttention = connection && (connection.status === 'expired' || connection.status === 'needs_reauthorization')
    const matchesSearch = searchQuery === "" ||
      provider.name.toLowerCase().includes(searchQuery.toLowerCase())
    return needsAttention && matchesSearch
  }).sort((a, b) => a.name.localeCompare(b.name))

  // Filter available apps (not connected at all - no integration record)
  const availableApps = providers.filter(provider => {
    if (["ai", "logic", "control"].includes(provider.id)) return false
    const connection = getConnectionStatus(provider.id)
    // Only show as available if there's NO integration record at all
    const isAvailable = !connection
    const matchesSearch = availableSearchQuery === "" ||
      provider.name.toLowerCase().includes(availableSearchQuery.toLowerCase())
    return isAvailable && matchesSearch
  }).sort((a, b) => a.name.localeCompare(b.name))

  const stats = {
    connected: integrations.filter(i => i.status === 'connected').length,
    available: availableApps.length,
  }

  // Show loading state until initial data is loaded
  if (!initialLoadComplete || (providers.length === 0 && storeLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading apps and integrations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Action */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {stats.connected} connected, {stats.available} available
          </p>
        </div>

        <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Connect New App
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Connect New App</DialogTitle>
              <DialogDescription>
                Choose an app to connect to your account
              </DialogDescription>
            </DialogHeader>

            {/* Search for available apps */}
            <div className="relative">
              <Input
                placeholder="Search available apps..."
                value={availableSearchQuery}
                onChange={(e) => setAvailableSearchQuery(e.target.value)}
              />
            </div>

            {/* Available apps grid */}
            <div className="grid sm:grid-cols-2 gap-3 overflow-y-auto max-h-[50vh] pr-2">
              {availableApps.length === 0 ? (
                <div className="col-span-2 text-center py-8">
                  <p className="text-muted-foreground">
                    {availableSearchQuery ? "No apps found matching your search" : "All apps are already connected!"}
                  </p>
                </div>
              ) : (
                availableApps.map((provider) => (
                  <Card key={provider.id} className="hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 bg-white dark:bg-slate-900">
                          <img
                            src={`/integrations/${provider.id}.svg`}
                            alt={provider.name}
                            className={getIntegrationLogoClasses(provider.id)}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm truncate">{provider.name}</h3>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleConnect(provider.id)}
                          disabled={loading[provider.id]}
                        >
                          {loading[provider.id] ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Plus className="w-3 h-3 mr-1" />
                              Connect
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Apps Needing Attention */}
      {appsNeedingAttention.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Needs Attention</h3>
            <Badge variant="destructive">{appsNeedingAttention.length}</Badge>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {appsNeedingAttention.map((provider) => {
              const connection = getConnectionStatus(provider.id)
              const isExpired = connection?.status === 'expired' || connection?.status === 'needs_reauthorization'

              return (
                <Card key={provider.id} className="group hover:shadow-md transition-all border-destructive/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      {/* App Icon */}
                      <div className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 bg-white dark:bg-slate-900">
                        <img
                          src={`/integrations/${provider.id}.svg`}
                          alt={provider.name}
                          className={getIntegrationLogoClasses(provider.id)}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      </div>

                      {/* App Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm truncate">{provider.name}</h3>
                        </div>
                        <Badge variant="destructive" className="text-xs">
                          Reconnect
                        </Badge>
                      </div>

                      {/* Actions Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleReconnect(provider.id)}
                            disabled={loading[provider.id]}
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Reconnect
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => connection && handleDisconnect(connection.id, provider.name)}
                            disabled={loading[connection?.id || '']}
                          >
                            <Unplug className="w-4 h-4 mr-2" />
                            Disconnect
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Connection Details */}
                    {connection && (
                      <div className="text-xs text-muted-foreground">
                        <p>Connected {new Date(connection.created_at).toLocaleDateString()}</p>
                        {connection.expires_at && (
                          <p className="text-destructive">
                            Expired {new Date(connection.expires_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Search Connected Apps */}
      <div className="relative">
        <Input
          placeholder="Search connected apps..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Connected Apps Grid */}
      {connectedApps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed rounded-xl">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No Connected Apps</h3>
          <p className="text-muted-foreground text-center max-w-md mb-4">
            {searchQuery
              ? "No connected apps match your search"
              : "Connect your first app to start building workflows"
            }
          </p>
          {!searchQuery && (
            <Button onClick={() => setShowConnectDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Connect Your First App
            </Button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {connectedApps.map((provider) => {
            const connection = getConnectionStatus(provider.id)
            const isExpired = connection?.status === 'expired' || connection?.status === 'needs_reauthorization'

            return (
              <Card key={provider.id} className="group hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    {/* App Icon */}
                    <div className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 bg-white dark:bg-slate-900">
                      <img
                        src={`/integrations/${provider.id}.svg`}
                        alt={provider.name}
                        className={getIntegrationLogoClasses(provider.id)}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    </div>

                    {/* App Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm truncate">{provider.name}</h3>
                        {!isExpired && (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                      {isExpired ? (
                        <Badge variant="destructive" className="text-xs">Expired</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Connected</Badge>
                      )}
                    </div>

                    {/* Actions Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isExpired ? (
                          <DropdownMenuItem
                            onClick={() => handleReconnect(provider.id)}
                            disabled={loading[provider.id]}
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Reconnect
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem onClick={() => handleReconnect(provider.id)}>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Refresh Connection
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Settings className="w-4 h-4 mr-2" />
                              View Settings
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => connection && handleDisconnect(connection.id, provider.name)}
                          disabled={loading[connection?.id || '']}
                        >
                          <Unplug className="w-4 h-4 mr-2" />
                          Disconnect
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Connection Details */}
                  {connection && (
                    <div className="text-xs text-muted-foreground">
                      <p>Connected {new Date(connection.created_at).toLocaleDateString()}</p>
                      {connection.expires_at && !isExpired && (
                        <p>
                          Expires {new Date(connection.expires_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Footer Help */}
      <div className="mt-12 p-6 border rounded-xl bg-muted/30">
        <h3 className="font-semibold mb-2">Need a custom integration?</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Can't find the app you're looking for? Request a new integration or use our API.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" size="sm">
            <ExternalLink className="w-4 h-4 mr-2" />
            Request Integration
          </Button>
          <Button variant="outline" size="sm">
            <ExternalLink className="w-4 h-4 mr-2" />
            View API Docs
          </Button>
        </div>
      </div>
    </div>
  )
}
