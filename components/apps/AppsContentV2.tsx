"use client"

import { useEffect, useState, useCallback } from "react"
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
  Trash2,
  AlertTriangle,
  Zap,
  Search,
  X,
  Plug,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { logger } from "@/lib/utils/logger"
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"

// Category definitions for filter pills
const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "communication", label: "Communication" },
  { id: "productivity", label: "Productivity" },
  { id: "crm", label: "CRM" },
  { id: "storage", label: "Storage" },
  { id: "e-commerce", label: "Commerce" },
  { id: "social", label: "Social" },
  { id: "analytics", label: "Analytics" },
] as const

// Skeleton card for loading state
function IntegrationCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-24 rounded bg-muted" />
          <div className="h-4 w-16 rounded-full bg-muted" />
        </div>
      </div>
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-9 w-full rounded-lg bg-muted" />
    </div>
  )
}

function IntegrationsSkeletonGrid() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="h-5 w-80 rounded bg-muted animate-pulse" />
      </div>
      {/* Stats skeleton */}
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-7 w-28 rounded-full bg-muted animate-pulse" />
        ))}
      </div>
      {/* Search skeleton */}
      <div className="h-11 w-full max-w-lg rounded-xl bg-muted animate-pulse" />
      {/* Grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <IntegrationCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

export function AppsContentV2() {
  const { providers, integrations, fetchAllIntegrations, connectIntegration, disconnectIntegration, initializeProviders, loading: storeLoading, lastFetchTime } = useIntegrationStore()
  const { user } = useAuthStore()
  const { theme } = useTheme()
  const { teams: allTeams, organizations: allOrganizations } = useWorkspaces()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedWorkspaceType, setSelectedWorkspaceType] = useState<'personal' | 'team' | 'organization'>('personal')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [loading, setLocalLoading] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<'all' | 'connected' | 'available' | 'attention'>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [detailProvider, setDetailProvider] = useState<string | null>(null)
  const { toast } = useToast()

  const teams = allTeams
  const organizations = allOrganizations

  // Note: initializeProviders is handled by PagePreloader for parallel loading
  // We only need to call it if providers are empty (e.g., after a failed initial load)
  useEffect(() => {
    if (providers.length === 0 && !storeLoading) {
      initializeProviders()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers.length, storeLoading])

  useEffect(() => {
    if (user) {
      fetchAllIntegrations()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Debug: Log integrations when they change
  useEffect(() => {
    if (integrations.length > 0) {
      logger.info('[AppsContentV2] Integrations loaded:', {
        count: integrations.length,
        providers: integrations.map(i => ({ provider: i.provider, status: i.status }))
      })
    }
  }, [integrations])

  // Provider mapping for shared OAuth - maps UI provider IDs to stored integration providers
  const providerMapping: Record<string, string> = {
    'gmail': 'google',
    'google-docs': 'google',
    'google-drive': 'google',
    'google-sheets': 'google',
    'google-calendar': 'google',
    'google-analytics': 'google',
    'outlook': 'microsoft-outlook',
    'teams': 'microsoft-outlook',
    'microsoft-teams': 'microsoft-outlook',
    'microsoft-excel': 'microsoft-outlook',
    'microsoft-onenote': 'microsoft-outlook',
    'onedrive': 'microsoft-outlook',
  }

  const getConnectionStatus = useCallback((providerId: string) => {
    const directConnection = integrations.find(i => i.provider === providerId)
    if (directConnection) return directConnection

    const mappedProvider = providerMapping[providerId]
    if (mappedProvider) {
      const mappedConnection = integrations.find(i => i.provider === mappedProvider)
      if (mappedConnection && mappedConnection.status === 'connected') {
        return {
          ...mappedConnection,
          provider: providerId,
          _isSharedAuth: true,
          _sharedWith: mappedProvider,
        }
      }
    }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrations])

  const getConnectedAccounts = useCallback((providerId: string) => {
    const actualProvider = providerMapping[providerId] || providerId
    let accounts = integrations.filter(i => i.provider === providerId && i.status === 'connected')
    if (accounts.length === 0 && actualProvider !== providerId) {
      accounts = integrations.filter(i => i.provider === actualProvider && i.status === 'connected')
    }
    return accounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrations])

  const formatConnectedDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const handleConnect = async (providerId: string) => {
    logger.info('[AppsContentV2] handleConnect called', {
      providerId,
      selectedWorkspaceType,
      selectedWorkspaceId,
      hasUser: !!user
    })

    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to connect integrations.", variant: "destructive" })
      return
    }

    setLocalLoading(prev => ({ ...prev, [providerId]: true }))

    try {
      logger.info('[AppsContentV2] Calling connectIntegration...')
      await connectIntegration(providerId, selectedWorkspaceType, selectedWorkspaceId)
      logger.info('[AppsContentV2] connectIntegration completed')
    } catch (error: any) {
      logger.info('[AppsContentV2] connectIntegration error:', error?.message)
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
      await disconnectIntegration(integrationId)
      toast({ title: "Disconnected", description: `${providerName} has been disconnected.` })
    } catch (error: any) {
      logger.error("Failed to disconnect integration:", error)
      toast({ title: "Error", description: error?.message || "An unexpected error occurred.", variant: "destructive" })
    } finally {
      setLocalLoading(prev => ({ ...prev, [integrationId]: false }))
    }
  }

  // Filtered app lists
  const allAvailableApps = providers.filter(provider => {
    if (["ai", "logic", "control"].includes(provider.id)) return false
    const matchesSearch = searchQuery === "" ||
      provider.name.toLowerCase().includes(searchQuery.toLowerCase())
    const config = INTEGRATION_CONFIGS[provider.id]
    const matchesCategory = selectedCategory === "all" || config?.category === selectedCategory
    return matchesSearch && matchesCategory
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

  const filteredConnectedApps = connectedApps.filter(provider => {
    const matchesSearch = searchQuery === "" ||
      provider.name.toLowerCase().includes(searchQuery.toLowerCase())
    const config = INTEGRATION_CONFIGS[provider.id]
    const matchesCategory = selectedCategory === "all" || config?.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const stats = {
    connected: integrations.filter(i => i.status === 'connected').length,
    available: providers.filter(p => !["ai", "logic", "control"].includes(p.id)).length,
    needsAttention: appsNeedingAttention.length,
  }

  const hasInitialFetchCompleted = lastFetchTime !== null
  const isInitialLoading = (providers.length === 0 && storeLoading) ||
    (providers.length > 0 && !hasInitialFetchCompleted && storeLoading)

  // Loading skeleton
  if (isInitialLoading) {
    return <IntegrationsSkeletonGrid />
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
      case 'all':
      default:
        return allAvailableApps
    }
  }

  const appsList = getAppsList()

  // Detail sheet provider data
  const detailProviderData = detailProvider ? providers.find(p => p.id === detailProvider) : null
  const detailAccounts = detailProvider ? getConnectedAccounts(detailProvider) : []
  const detailConfig = detailProvider ? INTEGRATION_CONFIGS[detailProvider] : null

  return (
    <div className="space-y-6">
      {/* Row 1: Title + Stats left, Search right */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between animate-fade-in">
        <div className="space-y-2 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Apps</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-sm text-muted-foreground">
              Connect your favorite tools to automate workflows
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {stats.connected} connected
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {stats.available} available
              </span>
              {stats.needsAttention > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3" />
                  {stats.needsAttention} need attention
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Search — full-width mobile, fixed-width desktop */}
        <div className="relative w-full lg:w-80 xl:w-96 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-9 text-sm bg-background border border-input rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-colors"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Toolbar — Status tabs left, Category filter right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        {/* Status Tabs — underline style */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none -mb-px">
          {[
            { id: 'all' as const, label: 'All', count: stats.available },
            { id: 'connected' as const, label: 'Connected', count: stats.connected },
            { id: 'available' as const, label: 'Available', count: stats.available },
            ...(stats.needsAttention > 0 ? [{ id: 'attention' as const, label: 'Needs Attention', count: stats.needsAttention }] : []),
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setDetailProvider(null) }}
              className={cn(
                "relative px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? tab.id === 'attention'
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              <span className={cn(
                "ml-1.5 text-xs tabular-nums",
                activeTab === tab.id
                  ? "text-inherit"
                  : "text-muted-foreground"
              )}>
                {tab.count}
              </span>
              {/* Active indicator bar */}
              {activeTab === tab.id && (
                <span className={cn(
                  "absolute bottom-0 left-3 right-3 h-0.5 rounded-full",
                  tab.id === 'attention' ? "bg-amber-500" : "bg-foreground"
                )} />
              )}
            </button>
          ))}
        </div>

        {/* Category Filter — pill row on desktop, horizontal scroll on mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-shrink-0">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-all",
                selectedCategory === cat.id
                  ? "bg-secondary text-secondary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Integration Card Grid — 4 columns on xl */}
      {appsList.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {appsList.map((provider, index) => {
            const accounts = getConnectedAccounts(provider.id)
            const isConnected = accounts.length > 0
            const isExpired = accounts.some(a => a.status === 'expired' || a.status === 'needs_reauthorization')
            const config = INTEGRATION_CONFIGS[provider.id]
            const categoryLabel = config?.category
              ? config.category.charAt(0).toUpperCase() + config.category.slice(1)
              : "Integration"

            return (
              <div
                key={provider.id}
                className={cn(
                  "group relative rounded-xl border bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.02] cursor-pointer animate-fade-in-up",
                  isExpired
                    ? "border-amber-400/40 dark:border-amber-500/30"
                    : isConnected
                      ? "border-l-[3px] border-l-green-500 border-t border-r border-b border-border"
                      : "border-border"
                )}
                style={{
                  animationDelay: `${index * 50}ms`,
                  animationFillMode: 'both',
                }}
                onClick={() => {
                  if (isConnected || isExpired) {
                    setDetailProvider(provider.id)
                  }
                }}
              >
                {/* Expired accent bar */}
                {isExpired && (
                  <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-orange-400" />
                )}

                <div className="p-5 space-y-4">
                  {/* Top: Icon + Name + Category */}
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "relative w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border",
                        isExpired
                          ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20"
                          : isConnected
                            ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20"
                            : "bg-muted/50 border-border"
                      )}
                    >
                      <img
                        src={getIntegrationLogoPath(provider.id, theme)}
                        alt={provider.name}
                        className={getIntegrationLogoClasses(provider.id, "w-7 h-7")}
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight">{provider.name}</h3>
                      <span className={cn(
                        "inline-block mt-1 px-2 py-0.5 text-[10px] font-medium rounded-full",
                        "bg-muted text-muted-foreground"
                      )}>
                        {categoryLabel}
                      </span>
                    </div>
                  </div>

                  {/* Middle: Description or Status */}
                  <div className="min-h-[2.5rem]">
                    {isConnected && !isExpired ? (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                          {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
                        </span>
                      </div>
                    ) : isExpired ? (
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                          Needs reconnection
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {config?.description || `Connect ${provider.name} to your workflows`}
                      </p>
                    )}
                  </div>

                  {/* Bottom: Action Button */}
                  <div>
                    {isConnected && !isExpired ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full h-9 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30 bg-green-50/50 dark:bg-green-500/5 hover:bg-green-100 dark:hover:bg-green-500/10"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailProvider(provider.id)
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        Connected
                      </Button>
                    ) : isExpired ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full h-9 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 hover:bg-amber-100 dark:hover:bg-amber-500/10"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailProvider(provider.id)
                        }}
                      >
                        <RefreshCw className="w-4 h-4 mr-1.5" />
                        Reconnect
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full h-9 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all"
                        onClick={async (e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          try {
                            await handleConnect(provider.id)
                          } catch (err) {
                            logger.error('[AppsContentV2] Unhandled error in connect button:', err)
                          }
                        }}
                        disabled={loading[provider.id]}
                      >
                        {loading[provider.id] ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Plug className="w-4 h-4 mr-1.5" />
                            Connect
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Empty States */
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center mb-5",
            activeTab === 'attention'
              ? "bg-green-100 dark:bg-green-500/10"
              : "bg-muted"
          )}>
            {activeTab === 'connected' ? (
              <Zap className="w-8 h-8 text-muted-foreground" />
            ) : activeTab === 'attention' ? (
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            ) : (
              <Search className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          <h3 className="text-lg font-semibold">
            {activeTab === 'connected' ? 'No connected integrations yet' :
             activeTab === 'attention' ? 'All integrations are healthy' :
             searchQuery ? 'No integrations found' : 'No integrations available'}
          </h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            {activeTab === 'connected' ? 'Connect your first integration to start automating your workflows.' :
             activeTab === 'attention' ? 'All your integrations are running smoothly. No action needed.' :
             searchQuery ? `No results for "${searchQuery}". Try a different search term.` :
             'Check back later for new integrations.'}
          </p>
          {activeTab === 'connected' && (
            <Button
              type="button"
              size="sm"
              className="mt-5"
              onClick={() => setActiveTab('all')}
            >
              <Plug className="w-4 h-4 mr-1.5" />
              Browse Integrations
            </Button>
          )}
          {searchQuery && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-5"
              onClick={() => setSearchQuery("")}
            >
              Clear Search
            </Button>
          )}
        </div>
      )}

      {/* Footer Help */}
      <div className="p-6 border rounded-xl bg-gradient-to-r from-muted/30 to-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm">Need a custom integration?</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Request a new integration or use our API to build your own
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Request
          </Button>
          <Button type="button" variant="outline" size="sm">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            API Docs
          </Button>
        </div>
      </div>

      {/* Detail Slide-Out Panel */}
      <Sheet open={!!detailProvider} onOpenChange={(open) => { if (!open) setDetailProvider(null) }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailProviderData && (
            <div className="space-y-6">
              <SheetHeader className="space-y-4">
                {/* Provider header */}
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center border",
                    detailAccounts.some(a => a.status === 'expired' || a.status === 'needs_reauthorization')
                      ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20"
                      : detailAccounts.length > 0
                        ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20"
                        : "bg-muted/50 border-border"
                  )}>
                    <img
                      src={getIntegrationLogoPath(detailProviderData.id, theme)}
                      alt={detailProviderData.name}
                      className={getIntegrationLogoClasses(detailProviderData.id, "w-8 h-8")}
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  </div>
                  <div>
                    <SheetTitle className="text-xl">{detailProviderData.name}</SheetTitle>
                    {detailConfig?.category && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                        {detailConfig.category.charAt(0).toUpperCase() + detailConfig.category.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
                {detailConfig?.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {detailConfig.description}
                  </p>
                )}
              </SheetHeader>

              {/* Capabilities */}
              {detailConfig?.capabilities && detailConfig.capabilities.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Capabilities
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {detailConfig.capabilities.map(cap => (
                      <span
                        key={cap}
                        className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg bg-muted/70 text-muted-foreground"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected Accounts */}
              {detailAccounts.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Connected Accounts
                  </h4>
                  <div className="space-y-2">
                    {detailAccounts.map(account => {
                      const accountIdentifier = account.email
                        || account.username
                        || account.account_name
                        || account.metadata?.email
                        || account.metadata?.name
                        || `${detailProviderData.name} account`
                      const accountExpired = account.status === 'expired' || account.status === 'needs_reauthorization'
                      const accountAvatar = account.avatar_url
                        || account.metadata?.avatar_url
                        || account.metadata?.picture
                        || account.metadata?.profile_picture_url

                      return (
                        <div
                          key={account.id}
                          className={cn(
                            "flex items-center gap-3 p-3.5 rounded-xl border bg-card transition-colors",
                            accountExpired ? "border-amber-300 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5" : "border-border"
                          )}
                        >
                          {/* Account Avatar */}
                          {accountAvatar ? (
                            <img
                              src={accountAvatar}
                              alt={accountIdentifier}
                              className={cn(
                                "w-9 h-9 rounded-full object-cover flex-shrink-0 border-2",
                                accountExpired ? "border-amber-300 dark:border-amber-500/30" : "border-green-200 dark:border-green-500/20"
                              )}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                                const fallback = e.currentTarget.nextElementSibling as HTMLElement
                                if (fallback) fallback.style.display = 'flex'
                              }}
                            />
                          ) : null}
                          <div
                            className={cn(
                              "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0",
                              accountExpired ? "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary",
                              accountAvatar && "hidden"
                            )}
                          >
                            {accountIdentifier.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium truncate">{accountIdentifier}</p>
                              {/* Workspace type badge */}
                              {account.workspace_type === 'team' && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                  <Users className="w-2.5 h-2.5" />
                                  Team
                                </span>
                              )}
                              {account.workspace_type === 'organization' && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                  <Building className="w-2.5 h-2.5" />
                                  Org
                                </span>
                              )}
                              {(!account.workspace_type || account.workspace_type === 'personal') && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  <Home className="w-2.5 h-2.5" />
                                  Personal
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {accountExpired ? (
                                <span className="text-amber-600 dark:text-amber-400 font-medium">Needs reconnection</span>
                              ) : (
                                `Connected ${formatConnectedDate(account.created_at)}`
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {accountExpired && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleConnect(detailProviderData.id)}
                                disabled={loading[detailProviderData.id]}
                                className="h-8 text-xs border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                              >
                                {loading[detailProviderData.id] ? (
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
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDisconnect(account.id, detailProviderData.name)}
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
              <div className="space-y-3 pt-2 border-t">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2">
                  {detailAccounts.length > 0 ? 'Add Another Account' : 'Connect Account'}
                </h4>
                <div className="flex items-center gap-3">
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
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault()
                      try {
                        await handleConnect(detailProviderData.id)
                      } catch (err) {
                        logger.error('[AppsContentV2] Unhandled error in connect button:', err)
                      }
                    }}
                    disabled={loading[detailProviderData.id]}
                    className="h-9 flex-1"
                  >
                    {loading[detailProviderData.id] ? (
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    {detailAccounts.length > 0 ? 'Add Account' : 'Connect'}
                  </Button>
                </div>
              </div>

              {/* Docs link */}
              {detailConfig?.docsUrl && (
                <div className="pt-2">
                  <a
                    href={detailConfig.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View API Documentation
                  </a>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
