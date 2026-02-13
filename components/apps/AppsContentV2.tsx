"use client"

import { useEffect, useState } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import {
  CheckCircle2,
  Plus,
  ExternalLink,
  RefreshCw,
  Home,
  Users,
  Building,
  Check,
  Trash2,
  AlertTriangle,
  Zap,
  Search,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { logger } from "@/lib/utils/logger"
import { IntegrationService } from "@/services/integration-service"
import { getIntegrationLogoClasses, getIntegrationLogoPath } from "@/lib/integrations/logoStyles"
import { useTheme } from "next-themes"
import { useWorkspaces } from "@/hooks/useWorkspaces"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"

export function AppsContentV2() {
  const { providers, integrations, fetchAllIntegrations, connectIntegration, initializeProviders, loading: storeLoading, lastFetchTime } = useIntegrationStore()
  const { user } = useAuthStore()
  const { theme } = useTheme()
  const { teams: allTeams, organizations: allOrganizations } = useWorkspaces()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedWorkspaceType, setSelectedWorkspaceType] = useState<'personal' | 'team' | 'organization'>('personal')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [loading, setLocalLoading] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<'connected' | 'available' | 'attention'>('connected')
  const [expandedApp, setExpandedApp] = useState<string | null>(null)
  const { toast } = useToast()

  const teams = allTeams.filter(team => team.user_role === 'owner' || team.user_role === 'admin')
  const organizations = allOrganizations.filter(org => org.user_role === 'owner' || org.user_role === 'admin')

  // Initialize providers on mount
  useEffect(() => {
    initializeProviders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (user) {
      fetchAllIntegrations()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const getConnectionStatus = (providerId: string) => {
    const directConnection = integrations.find(i => i.provider === providerId)
    if (directConnection) return directConnection

    const config = INTEGRATION_CONFIGS[providerId]
    if (config?.sharesAuthWith) {
      const sharedConnection = integrations.find(i => i.provider === config.sharesAuthWith)
      if (sharedConnection && sharedConnection.status === 'connected') {
        return {
          ...sharedConnection,
          provider: providerId,
          _isSharedAuth: true,
          _sharedWith: config.sharesAuthWith,
        }
      }
    }
    return undefined
  }

  const getConnectedAccounts = (providerId: string) => {
    return integrations.filter(i => i.provider === providerId && i.status === 'connected')
  }

  const formatConnectedDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const handleConnect = async (providerId: string) => {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to connect integrations.", variant: "destructive" })
      return
    }

    setLocalLoading(prev => ({ ...prev, [providerId]: true }))

    try {
      await connectIntegration(providerId, selectedWorkspaceType, selectedWorkspaceId)
    } catch (error: any) {
      const isCancellation = error?.message?.toLowerCase().includes('cancel')
      if (!isCancellation) {
        logger.error("Connection error:", error)
        const provider = providers.find(p => p.id === providerId)
        const displayName = provider?.name || providerId
        toast({ title: "Connection Error", description: error?.message || `Failed to connect ${displayName}. Please try again.`, variant: "destructive" })
      }
    } finally {
      setLocalLoading(prev => ({ ...prev, [providerId]: false }))
    }
  }

  const handleDisconnect = async (integrationId: string, providerName: string) => {
    setLocalLoading(prev => ({ ...prev, [integrationId]: true }))

    try {
      await IntegrationService.disconnectIntegration(integrationId)
      toast({ title: "Disconnected", description: `${providerName} has been disconnected.` })
      fetchAllIntegrations()
    } catch (error: any) {
      logger.error("Failed to disconnect integration:", error)
      toast({ title: "Error", description: error?.message || "An unexpected error occurred.", variant: "destructive" })
    } finally {
      setLocalLoading(prev => ({ ...prev, [integrationId]: false }))
    }
  }

  // All available apps filtered by search
  const allAvailableApps = providers.filter(provider => {
    if (["ai", "logic", "control"].includes(provider.id)) return false
    const matchesSearch = searchQuery === "" ||
      provider.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  }).sort((a, b) => a.name.localeCompare(b.name))

  const appsNeedingAttention = providers.filter(provider => {
    if (["ai", "logic", "control"].includes(provider.id)) return false
    const connection = getConnectionStatus(provider.id)
    return connection && (connection.status === 'expired' || connection.status === 'needs_reauthorization')
  })

  const connectedApps = providers.filter(provider => {
    if (["ai", "logic", "control"].includes(provider.id)) return false
    const accounts = getConnectedAccounts(provider.id)
    return accounts.length > 0
  })

  // Filter based on search
  const filteredConnectedApps = connectedApps.filter(provider => {
    const matchesSearch = searchQuery === "" ||
      provider.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const stats = {
    connected: integrations.filter(i => i.status === 'connected').length,
    available: providers.filter(p => !["ai", "logic", "control"].includes(p.id)).length,
    needsAttention: appsNeedingAttention.length,
  }

  const hasInitialFetchCompleted = lastFetchTime !== null
  const isInitialLoading = (providers.length === 0 && storeLoading) ||
    (providers.length > 0 && !hasInitialFetchCompleted && storeLoading)

  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading apps and integrations...</p>
        </div>
      </div>
    )
  }

  // Render a single column expandable app row
  const renderAppRow = (provider: typeof providers[0]) => {
    const accounts = getConnectedAccounts(provider.id)
    const isConnected = accounts.length > 0
    const isExpired = accounts.some(a => a.status === 'expired' || a.status === 'needs_reauthorization')
    const isExpanded = expandedApp === provider.id

    return (
      <div
        key={provider.id}
        className={cn(
          "border rounded-xl bg-card overflow-hidden transition-all",
          isExpired ? "border-destructive/30" : isConnected ? "border-green-500/20" : "border-border",
          isExpanded && "ring-2 ring-primary/20"
        )}
      >
        {/* Row Header - Always visible */}
        <button
          onClick={() => setExpandedApp(isExpanded ? null : provider.id)}
          className={cn(
            "w-full flex items-center gap-4 p-4 text-left transition-colors",
            "hover:bg-muted/30"
          )}
        >
          {/* App Icon */}
          <div className="relative flex-shrink-0">
            <div className={cn(
              "w-12 h-12 rounded-xl border-2 flex items-center justify-center bg-white dark:bg-slate-900",
              isExpired ? "border-destructive/40" : isConnected ? "border-green-500/40" : "border-border"
            )}>
              <img
                src={getIntegrationLogoPath(provider.id, theme)}
                alt={provider.name}
                className={getIntegrationLogoClasses(provider.id, "w-6 h-6")}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </div>
            {isConnected && !isExpired && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
            {isExpired && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-destructive border-2 border-white dark:border-slate-900 flex items-center justify-center">
                <AlertTriangle className="w-3 h-3 text-white" />
              </div>
            )}
          </div>

          {/* App Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base">{provider.name}</h3>
            {isConnected ? (
              <p className={cn(
                "text-sm",
                isExpired ? "text-destructive" : "text-green-600 dark:text-green-400"
              )}>
                {isExpired ? 'Needs reconnection' : `${accounts.length} account${accounts.length !== 1 ? 's' : ''} connected`}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Not connected</p>
            )}
          </div>

          {/* Quick Connect Button (when not expanded and not connected) */}
          {!isExpanded && !isConnected && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                handleConnect(provider.id)
              }}
              disabled={loading[provider.id]}
              className="flex-shrink-0"
            >
              {loading[provider.id] ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1" />
                  Connect
                </>
              )}
            </Button>
          )}

          {/* Expand/Collapse indicator */}
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0",
            isExpanded ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            <ChevronDown className={cn(
              "w-4 h-4 transition-transform",
              isExpanded && "rotate-180"
            )} />
          </div>
        </button>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t px-4 pb-4 pt-3 space-y-4 bg-muted/20">
            {/* Connected Accounts */}
            {accounts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Connected Accounts
                </h4>
                <div className="space-y-2">
                  {accounts.map(account => {
                    const accountIdentifier = account.email
                      || account.username
                      || account.account_name
                      || account.metadata?.email
                      || account.metadata?.name
                      || `${provider.name} account`
                    const accountExpired = account.status === 'expired' || account.status === 'needs_reauthorization'

                    return (
                      <div
                        key={account.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border bg-card",
                          accountExpired && "border-destructive/30 bg-destructive/5"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0",
                          accountExpired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                        )}>
                          {accountIdentifier.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{accountIdentifier}</p>
                          <p className="text-xs text-muted-foreground">
                            {accountExpired ? (
                              <span className="text-destructive">Needs reconnection</span>
                            ) : (
                              `Connected ${formatConnectedDate(account.created_at)}`
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {accountExpired && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConnect(provider.id)}
                              disabled={loading[provider.id]}
                              className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                            >
                              {loading[provider.id] ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Reconnect
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDisconnect(account.id, provider.name)}
                            disabled={loading[account.id]}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            {loading[account.id] ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Add Account Section */}
            <div className="flex items-center gap-3 pt-2">
              {(teams.length > 0 || organizations.length > 0) && (
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
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue placeholder="Workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">
                      <div className="flex items-center gap-2">
                        <Home className="w-4 h-4" />
                        <span>Personal</span>
                      </div>
                    </SelectItem>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={`team-${team.id}`}>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          <span>{team.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                    {organizations.map(org => (
                      <SelectItem key={org.id} value={`organization-${org.id}`}>
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4" />
                          <span>{org.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                onClick={() => handleConnect(provider.id)}
                disabled={loading[provider.id]}
                className="h-9"
              >
                {loading[provider.id] ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {accounts.length > 0 ? 'Add Account' : 'Connect'}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Get the list of apps to show based on active tab
  const getAppsList = () => {
    switch (activeTab) {
      case 'connected':
        return filteredConnectedApps
      case 'available':
        return allAvailableApps
      case 'attention':
        return appsNeedingAttention
      default:
        return []
    }
  }

  const appsList = getAppsList()

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
        <p className="text-muted-foreground">
          Connect and manage your integrations
        </p>
      </div>

      {/* Tabs + Search Row */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Tab Pills */}
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
          <button
            onClick={() => { setActiveTab('connected'); setExpandedApp(null) }}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-all",
              activeTab === 'connected'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Connected
            <span className={cn(
              "ml-2 px-1.5 py-0.5 text-xs rounded-full",
              activeTab === 'connected' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {stats.connected}
            </span>
          </button>
          <button
            onClick={() => { setActiveTab('available'); setExpandedApp(null) }}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-all",
              activeTab === 'available'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Available
            <span className={cn(
              "ml-2 px-1.5 py-0.5 text-xs rounded-full",
              activeTab === 'available' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {stats.available}
            </span>
          </button>
          {stats.needsAttention > 0 && (
            <button
              onClick={() => { setActiveTab('attention'); setExpandedApp(null) }}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-all",
                activeTab === 'attention'
                  ? "bg-destructive/10 text-destructive shadow-sm"
                  : "text-destructive/70 hover:text-destructive"
              )}
            >
              Attention
              <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-destructive/20 text-destructive">
                {stats.needsAttention}
              </span>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-4 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* Apps List - Single Column */}
      {appsList.length > 0 ? (
        <div className="space-y-3">
          {appsList.map(provider => renderAppRow(provider))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-muted/20">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            {activeTab === 'connected' ? (
              <Zap className="w-7 h-7 text-muted-foreground" />
            ) : activeTab === 'attention' ? (
              <CheckCircle2 className="w-7 h-7 text-green-500" />
            ) : (
              <Search className="w-7 h-7 text-muted-foreground" />
            )}
          </div>
          <h3 className="text-base font-medium">
            {activeTab === 'connected' ? 'No connected apps' :
             activeTab === 'attention' ? 'All apps are healthy' :
             'No apps found'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {activeTab === 'connected' ? 'Browse available apps to get started' :
             activeTab === 'attention' ? 'No apps need your attention right now' :
             'Try adjusting your search'}
          </p>
          {activeTab === 'connected' && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setActiveTab('available')}
            >
              Browse Apps
            </Button>
          )}
        </div>
      )}

      {/* Footer Help */}
      <div className="p-5 border rounded-xl bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-medium text-sm">Need a custom integration?</h3>
          <p className="text-sm text-muted-foreground">
            Request a new integration or use our API
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Request
          </Button>
          <Button variant="outline" size="sm">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            API Docs
          </Button>
        </div>
      </div>
    </div>
  )
}
