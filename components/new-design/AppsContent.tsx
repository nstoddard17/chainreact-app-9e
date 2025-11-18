"use client"

import { useEffect, useState, useRef } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { ProfessionalSearch } from "@/components/ui/professional-search"
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
import { CheckCircle2, Plus, ExternalLink, MoreVertical, Unplug, RefreshCw, Settings, AlertCircle, Shield, Eye, Home, Users, Building } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { logger } from "@/lib/utils/logger"
import { IntegrationService } from "@/services/integration-service"
import { getIntegrationLogoClasses, getIntegrationLogoPath } from "@/lib/integrations/logoStyles"
import { useTheme } from "next-themes"
import { AppsWorkspaceGroupView } from "@/components/apps/AppsWorkspaceGroupView"
import { useWorkspaces } from "@/hooks/useWorkspaces"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function AppsContent() {
  const { providers, integrations, initializeProviders, fetchAllIntegrations, connectIntegration, setLoading, loading: storeLoading } = useIntegrationStore()
  const { user } = useAuthStore()
  const { theme } = useTheme()
  const { teams: allTeams, organizations: allOrganizations } = useWorkspaces()
  const [availableSearchQuery, setAvailableSearchQuery] = useState("")
  const [showConnectDialog, setShowConnectDialog] = useState(false)
  const [selectedWorkspaceType, setSelectedWorkspaceType] = useState<'personal' | 'team' | 'organization'>('personal')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [loading, setLocalLoading] = useState<Record<string, boolean>>({})
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const { toast } = useToast()

  // Filter to only show workspaces where user can manage apps (owner or admin)
  const teams = allTeams.filter(team =>
    team.user_role === 'owner' || team.user_role === 'admin'
  )
  const organizations = allOrganizations.filter(org =>
    org.user_role === 'owner' || org.user_role === 'admin'
  )

  // Always fetch all integrations for grouped view
  useEffect(() => {
    if (user) {
      fetchAllIntegrations()
    }
  }, [user, fetchAllIntegrations])

  // Prevent React 18 Strict Mode double-fetch
  const hasInitializedRef = useRef(false)

  // PagePreloader already fetches user integrations
  // We just need to initialize providers (available apps) once when component mounts
  useEffect(() => {
    if (user && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      const loadProviders = async () => {
        await initializeProviders()
        setInitialLoadComplete(true)
      }
      loadProviders()
    }
    // Only run once on mount when user is available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])



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
      await connectIntegration(providerId, selectedWorkspaceType, selectedWorkspaceId)

      // Keep modal open so user can connect more apps without reopening
      // The connected app will automatically disappear from the list

      // No toast on success - user requested removal
    } catch (error: any) {
      // Don't show error toast if user cancelled (contains "cancel" in message)
      const isCancellation = error?.message?.toLowerCase().includes('cancel')

      if (!isCancellation) {
        logger.error("Connection error:", error)

        // Get provider display name for error message
        const provider = providers.find(p => p.id === providerId)
        const displayName = provider?.name || providerId

        toast({
          title: "Connection Error",
          description: error?.message || `Failed to connect ${displayName}. Please try again.`,
          variant: "destructive",
        })
      }
    } finally {
      // Always clear loading state immediately when OAuth closes
      setLocalLoading(prev => ({ ...prev, [providerId]: false }))
    }
  }

  const handleDisconnect = async (integrationId: string, providerName: string) => {
    setLocalLoading(prev => ({ ...prev, [integrationId]: true }))

    try {
      // Use IntegrationService which properly includes auth headers
      await IntegrationService.disconnectIntegration(integrationId)

      toast({
        title: "Disconnected",
        description: `${providerName} has been disconnected.`,
      })

      // Refresh integrations list
      fetchAllIntegrations()
    } catch (error: any) {
      logger.error("Failed to disconnect integration:", error)
      toast({
        title: "Error",
        description: error?.message || "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setLocalLoading(prev => ({ ...prev, [integrationId]: false }))
    }
  }

  const handleReconnect = async (providerId: string) => {
    handleConnect(providerId)
  }

  // Popular apps to show first (most commonly used integrations)
  const POPULAR_APPS = ['gmail', 'slack', 'notion', 'drive', 'twitter', 'discord', 'airtable', 'hubspot']

  // Filter available apps (not connected at all - no integration record)
  const allAvailableApps = providers.filter(provider => {
    if (["ai", "logic", "control"].includes(provider.id)) return false
    const connection = getConnectionStatus(provider.id)
    // Only show as available if there's NO integration record at all
    const isAvailable = !connection
    const matchesSearch = availableSearchQuery === "" ||
      provider.name.toLowerCase().includes(availableSearchQuery.toLowerCase())
    return isAvailable && matchesSearch
  })

  // Split into popular and other apps
  const popularApps = POPULAR_APPS
    .map(id => allAvailableApps.find(app => app.id === id))
    .filter((app): app is typeof allAvailableApps[0] => app !== undefined)

  const otherApps = allAvailableApps
    .filter(app => !POPULAR_APPS.includes(app.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const availableApps = [...popularApps, ...otherApps]

  // Filter apps that need attention (expired or need reauthorization)
  const appsNeedingAttention = providers.filter(provider => {
    if (["ai", "logic", "control"].includes(provider.id)) return false
    const connection = getConnectionStatus(provider.id)
    return connection && (connection.status === 'expired' || connection.status === 'needs_reauthorization')
  })

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
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {stats.connected} connected, {stats.available} available
        </p>

        <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Connect New App
            </Button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-[1400px] lg:max-w-[1800px] xl:max-w-[2400px] max-h-[80vh] border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle>Connect New App</DialogTitle>
              <DialogDescription>
                Select a workspace and choose an app to connect
              </DialogDescription>
            </DialogHeader>

            {/* Workspace Selector */}
            <div className="space-y-3 pb-4 border-b">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Which workspace?
                </label>
                <Select
                  value={selectedWorkspaceType === 'personal' ? 'personal' : `${selectedWorkspaceType}-${selectedWorkspaceId}`}
                  onValueChange={(value) => {
                    if (value === 'personal') {
                      setSelectedWorkspaceType('personal')
                      setSelectedWorkspaceId(null)
                    } else {
                      const [type, id] = value.split('-')
                      setSelectedWorkspaceType(type as 'team' | 'organization')
                      setSelectedWorkspaceId(id)
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">
                      <div className="flex items-center gap-2">
                        <Home className="w-4 h-4" />
                        <span>Personal Workspace</span>
                      </div>
                    </SelectItem>
                    {(teams || []).map(team => (
                      <SelectItem key={team.id} value={`team-${team.id}`}>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          <span>{team.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                    {(organizations || []).map(org => (
                      <SelectItem key={org.id} value={`organization-${org.id}`}>
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4" />
                          <span>{org.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {teams.length === 0 && organizations.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    You can only connect apps to your personal workspace. To connect apps to a team or organization, you need to be an owner or admin.
                  </p>
                )}
              </div>
            </div>

            {/* Search for available apps */}
            <ProfessionalSearch
              placeholder="Search available apps..."
              value={availableSearchQuery}
              onChange={(e) => setAvailableSearchQuery(e.target.value)}
              onClear={() => setAvailableSearchQuery('')}
            />

            {/* Available apps grid */}
            <div className="overflow-y-auto max-h-[500px] pr-2">
              <div className="space-y-6">
                {availableApps.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">
                      {availableSearchQuery ? "No apps found matching your search" : "All apps are already connected!"}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Most Popular Section */}
                    {!availableSearchQuery && popularApps.length > 0 && (
                      <div>
                        <div className="mb-4">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Most Popular</h3>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {popularApps.map((provider) => (
                            <Card key={provider.id} className="hover:bg-accent transition-all duration-200 shadow-sm hover:shadow-md">
                              <CardContent className="py-5 px-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                                      <img
                                        src={getIntegrationLogoPath(provider.id, theme)}
                                        alt={provider.name}
                                        className={getIntegrationLogoClasses(provider.id, "w-10 h-10 object-contain")}
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none'
                                        }}
                                      />
                                    </div>
                                    <h3 className="font-semibold text-sm whitespace-nowrap">{provider.name}</h3>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleConnect(provider.id)}
                                    disabled={loading[provider.id]}
                                    className="h-8 w-8 flex-shrink-0"
                                  >
                                    {loading[provider.id] ? (
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Plus className="w-4 h-4" />
                                    )}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* All Apps Section */}
                    {!availableSearchQuery && otherApps.length > 0 && (
                      <div>
                        <div className="mb-4">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">All Apps (A-Z)</h3>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {otherApps.map((provider) => (
                            <Card key={provider.id} className="hover:bg-accent transition-all duration-200 shadow-sm hover:shadow-md">
                              <CardContent className="py-5 px-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                                      <img
                                        src={getIntegrationLogoPath(provider.id, theme)}
                                        alt={provider.name}
                                        className={getIntegrationLogoClasses(provider.id, "w-10 h-10 object-contain")}
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none'
                                        }}
                                      />
                                    </div>
                                    <h3 className="font-semibold text-sm whitespace-nowrap">{provider.name}</h3>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleConnect(provider.id)}
                                    disabled={loading[provider.id]}
                                    className="h-8 w-8 flex-shrink-0"
                                  >
                                    {loading[provider.id] ? (
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Plus className="w-4 h-4" />
                                    )}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Search Results - Show all apps in one grid */}
                    {availableSearchQuery && (
                      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {availableApps.map((provider) => (
                          <Card key={provider.id} className="hover:bg-accent transition-all duration-200 shadow-sm hover:shadow-md">
                            <CardContent className="py-5 px-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                                    <img
                                      src={getIntegrationLogoPath(provider.id, theme)}
                                      alt={provider.name}
                                      className={getIntegrationLogoClasses(provider.id, "w-10 h-10 object-contain")}
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none'
                                      }}
                                    />
                                  </div>
                                  <h3 className="font-semibold text-sm whitespace-nowrap">{provider.name}</h3>
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleConnect(provider.id)}
                                  disabled={loading[provider.id]}
                                  className="h-8 w-8 flex-shrink-0"
                                >
                                  {loading[provider.id] ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Plus className="w-4 h-4" />
                                  )}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
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
                          src={getIntegrationLogoPath(provider.id, theme)}
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

      {/* Workspace Grouped View - Always On */}
      <AppsWorkspaceGroupView
        integrations={integrations.filter(i => i.status === 'connected')}
        renderAppCard={(integration) => {
            const provider = providers.find(p => p.id === integration.provider)
            if (!provider) return null

            return (
              <Card className="group hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    {/* App Icon */}
                    <div className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 bg-white dark:bg-slate-900">
                      <img
                        src={getIntegrationLogoPath(provider.id, theme)}
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
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {/* Permission Badge */}
                        {integration?.user_permission && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className={`text-xs px-1.5 py-0.5 flex items-center gap-0.5 ${
                                    integration.user_permission === 'admin'
                                      ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300'
                                      : integration.user_permission === 'manage'
                                      ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'
                                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
                                  }`}
                                >
                                  {integration.user_permission === 'admin' ? (
                                    <Shield className="w-3 h-3" />
                                  ) : integration.user_permission === 'manage' ? (
                                    <Settings className="w-3 h-3" />
                                  ) : (
                                    <Eye className="w-3 h-3" />
                                  )}
                                  <span className="hidden sm:inline">{integration.user_permission === 'admin' ? 'Admin' : integration.user_permission === 'manage' ? 'Manage' : 'View'}</span>
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{
                                  integration.user_permission === 'admin'
                                    ? 'Full control: connect, disconnect, manage permissions'
                                    : integration.user_permission === 'manage'
                                    ? 'Can reconnect and view details'
                                    : 'Can use in workflows (read-only)'
                                }</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
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
                          onClick={() => handleDisconnect(integration.id, provider.name)}
                          disabled={loading[integration.id]}
                        >
                          <Unplug className="w-4 h-4 mr-2" />
                          Disconnect
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Connection Details */}
                  {integration && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      {integration.account_name && <p className="truncate">Account: {integration.account_name}</p>}
                      {integration.email && <p className="truncate">{integration.email}</p>}
                      <p>Connected {new Date(integration.created_at).toLocaleDateString()}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          }}
        />

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
