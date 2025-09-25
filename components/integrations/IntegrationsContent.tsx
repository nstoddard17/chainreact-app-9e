"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useIntegrationStore, Integration } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import AppLayout from "@/components/layout/AppLayout"
import { IntegrationCardWrapper } from "@/components/integrations/IntegrationCardWrapper"
import { RefreshCw, Bell, Check, X, Search, AlertCircle } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { INTEGRATION_CONFIGS, type IntegrationConfig } from "@/lib/integrations/availableIntegrations"
import { Zap, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"

interface IntegrationsContentProps {
  configuredClients: Record<string, boolean>
}

function IntegrationsContent({ configuredClients }: IntegrationsContentProps) {
  const [activeFilter, setActiveFilter] = useState<"all" | "connected" | "expiring" | "expired" | "disconnected">("all")
  // Removed manual toggle states - using smart auto-refresh instead
  const [isInitializing, setIsInitializing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [openGuideForProviderId, setOpenGuideForProviderId] = useState<string | null>(null)
  const [metrics, setMetrics] = useState({
    connected: 0,
    expiring: 0,
    expired: 0,
    disconnected: 0,
    total: 0
  })
  const [loadingMetrics, setLoadingMetrics] = useState(false)
  const [wasHidden, setWasHidden] = useState(false)
  const { toast } = useToast()

  // Use selective subscriptions to prevent unnecessary re-renders
  const integrations = useIntegrationStore(state => state.integrations)
  const providers = useIntegrationStore(state => state.providers)
  const loading = useIntegrationStore(state => state.loading)
  const loadingStates = useIntegrationStore(state => state.loadingStates)
  const [initialFetchSettled, setInitialFetchSettled] = useState(false)

  // These functions don't change, so we can get them once
  const initializeProviders = useIntegrationStore(state => state.initializeProviders)
  const fetchIntegrations = useIntegrationStore(state => state.fetchIntegrations)
  const connectIntegration = useIntegrationStore(state => state.connectIntegration)
  const disconnectIntegration = useIntegrationStore(state => state.disconnectIntegration)
  const reconnectIntegration = useIntegrationStore(state => state.reconnectIntegration)
  const connectApiKeyIntegration = useIntegrationStore(state => state.connectApiKeyIntegration)
  const setLoading = useIntegrationStore(state => state.setLoading)
  const { user } = useAuthStore()
  const router = useRouter()

  const refreshIntegrations = useCallback(
    (force: boolean = false) => {
      const state = useIntegrationStore.getState()
      if (state.loadingStates?.['integrations']) {
        console.log('⏳ Integration fetch already in progress, skipping duplicate request')
        return Promise.resolve(null)
      }
      return fetchIntegrations(force).finally(() => setInitialFetchSettled(true))
    },
    [fetchIntegrations]
  )

  // Define fetchMetrics early to avoid initialization errors
  const fetchMetrics = useCallback(async () => {
    if (!user) return
    
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
    
    try {
      setLoadingMetrics(true)
      const response = await fetch("/api/analytics/integration-metrics", {
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        // Don't throw error, just log it
        console.warn("Failed to fetch integration metrics:", response.status)
        return
      }
      
      const data = await response.json()
      if (data.success && data.data) {
        setMetrics(data.data)
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        console.warn("Integration metrics request timeout")
      } else {
        console.error("Error fetching integration metrics:", error)
      }
      // Don't show error to user - metrics are non-critical
    } finally {
      setLoadingMetrics(false)
    }
  }, [user])

  // Removed localStorage management for auto-refresh toggles

  // Smart refresh on tab focus - refresh immediately after OAuth or if away for > 5 minutes
  useEffect(() => {
    let lastHiddenTime: number | null = null;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTime = Date.now();
        setWasHidden(true);
      } else if (document.visibilityState === 'visible' && wasHidden && lastHiddenTime) {
        const timeAway = Date.now() - lastHiddenTime;
        const fiveMinutes = 5 * 60 * 1000;
        const thirtySeconds = 30 * 1000;
        
        // Refresh immediately if user was away for less than 30 seconds (likely OAuth flow)
        // OR if user was away for more than 5 minutes (stale data)
        if (timeAway < thirtySeconds || timeAway > fiveMinutes) {
          console.log(`🔄 Refreshing integrations after ${timeAway < thirtySeconds ? 'OAuth flow' : 'extended absence'}`);
          refreshIntegrations(true);
          fetchMetrics();
        }
        setWasHidden(false);
        lastHiddenTime = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [wasHidden, refreshIntegrations, fetchMetrics]);

  // Listen for OAuth completion events to immediately refresh integrations
  useEffect(() => {
    const handleOAuthComplete = (event: MessageEvent) => {
      if (event.data?.type === 'oauth-complete' && event.data?.success) {
        console.log(`✅ OAuth completed for ${event.data.provider}, refreshing integrations...`);
        refreshIntegrations(true);
        fetchMetrics();
      }
    };

    // Listen for postMessage events
    window.addEventListener('message', handleOAuthComplete);

    // Also listen for BroadcastChannel events
    let broadcastChannel: BroadcastChannel | null = null;
    try {
      broadcastChannel = new BroadcastChannel('oauth_channel');
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'oauth-complete' && event.data?.success) {
          console.log(`✅ OAuth completed via BroadcastChannel for ${event.data.provider}, refreshing integrations...`);
          refreshIntegrations(true);
          fetchMetrics();
        }
      };
    } catch (e) {
      console.log('BroadcastChannel not available');
    }

    return () => {
      window.removeEventListener('message', handleOAuthComplete);
      broadcastChannel?.close();
    };
  }, [refreshIntegrations, fetchMetrics]);

  // Initialize providers and integrations on mount if user is authenticated
  useEffect(() => {
    if (!user) return

    // Initialize everything in parallel for faster loading - NON-BLOCKING
    const initializeData = async () => {
      // Prevent duplicate initialization
      if (isInitializing) return

      try {
        setIsInitializing(true)

        // Start operations in parallel but DON'T block the UI
        // Each operation has its own error handling

        // Initialize providers if not already loaded - fire and forget
        if (providers.length === 0) {
          initializeProviders().catch(error => {
            console.warn("Provider initialization failed (non-critical):", error)
            // Don't block - providers will load eventually or show empty
          })
        }

        // Fetch integrations - fire and forget
        refreshIntegrations(true).catch(error => {
          console.warn("Integration fetch failed (non-critical):", error)
          // Don't block - integrations will load eventually or show empty
        })

        // Fetch metrics - fire and forget
        fetchMetrics().catch(error => {
          console.warn("Metrics fetch failed (non-critical):", error)
          // Don't block - metrics are non-critical
        })

        // Don't wait for promises to complete - let them run in background
        // This prevents blocking navigation

        // Reset initializing flag after a short delay
        setTimeout(() => {
          setIsInitializing(false)
        }, 500)

      } catch (error) {
        console.error("Error starting integration initialization:", error)
        setIsInitializing(false)
      }
    }

    // Use setTimeout to make initialization truly non-blocking
    setTimeout(() => {
      initializeData()
      // Fallback settle in case store flags get stuck
      setTimeout(() => setInitialFetchSettled(true), 3000)
    }, 0)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshIntegrations]) // Only depend on user to avoid re-running

  // Add a fallback to prevent infinite loading for both fetches and connections
  useEffect(() => {
    const isLoadingIntegrations = loadingStates?.['integrations'] || false
    const isLoadingProviders = loadingStates?.['providers'] || false
    const isConnecting = Object.keys(loadingStates || {}).some(key => key.startsWith('connect-'))
    const isActuallyLoading = isLoadingIntegrations || isLoadingProviders || loading || isConnecting

    if (isActuallyLoading && user) {
      const timeout = setTimeout(() => {
        // Check what's stuck
        const currentState = useIntegrationStore.getState()
        const stuckLoadingStates = Object.entries(currentState.loadingStates || {})
          .filter(([_, value]) => value === true)
          .map(([key, _]) => key)

        if (stuckLoadingStates.length > 0) {
          console.warn(`⚠️ Clearing stuck loading states: ${stuckLoadingStates.join(', ')}`)

          // Reset all stuck states
          stuckLoadingStates.forEach(key => {
            setLoading(key, false)
          })

          // If it was a connection attempt, notify the user
          const stuckConnections = stuckLoadingStates.filter(key => key.startsWith('connect-'))
          if (stuckConnections.length > 0) {
            toast({
              title: "Connection Timeout",
              description: "The connection attempt took too long. Please try again.",
              variant: "destructive"
            })
          }
        }

        // For fetch operations, try one recovery attempt
        if (isLoadingIntegrations || isLoadingProviders) {
          refreshIntegrations(true).catch(() => {
            // If recovery fails, just reset states
            setLoading("integrations", false)
            setLoading("providers", false)
            setLoading("global", false)
          })
        }
      }, 30000) // 30 second timeout for connections, increased from 15

      return () => clearTimeout(timeout)
    }
  }, [loading, loadingStates, user, setLoading, refreshIntegrations, toast])

  // Auto-refresh metrics when integrations change (debounced to reduce excessive calls)
  useEffect(() => {
    if (user && integrations.length > 0) {
      // Debounce metrics fetching to avoid excessive API calls
      const timeoutId = setTimeout(() => {
        fetchMetrics()
      }, 300) // Reduced to 300ms for faster updates while still debouncing

      return () => clearTimeout(timeoutId)
    }
  }, [integrations.length, user, fetchMetrics]) // Only depend on length, not the whole array

  // Smart periodic refresh - only check for expiring tokens every 10 minutes
  useEffect(() => {
    if (!user) return

    const interval = setInterval(() => {
      // Only refresh metrics to check for token expiration
      fetchMetrics()
    }, 600000) // 10 minutes - less aggressive

    return () => clearInterval(interval)
  }, [user, fetchMetrics])

  // Listen for integration change events
  useEffect(() => {
    if (!user) return

    const handleIntegrationConnected = (event: Event) => {
      const customEvent = event as CustomEvent
      // Immediately refresh integrations to show the new connection
      refreshIntegrations(true)
      fetchMetrics()
      toast({
        title: "Integration Connected",
        description: `Successfully connected ${customEvent.detail?.providerId || 'integration'}`,
        variant: "default",
      })
    }

    const handleIntegrationDisconnected = (event: Event) => {
      const customEvent = event as CustomEvent
      // Immediately refresh integrations to show the disconnection
      refreshIntegrations(true)
      fetchMetrics()
      toast({
        title: "Integration Disconnected",
        description: `Successfully disconnected ${customEvent.detail?.provider || 'integration'}`,
        variant: "default",
      })
    }

    const handleIntegrationReconnected = (event: Event) => {
      const customEvent = event as CustomEvent
      // Immediately refresh integrations to show the reconnection
      refreshIntegrations(true)
      fetchMetrics()
      toast({
        title: "Integration Reconnected",
        description: `Successfully reconnected ${customEvent.detail?.provider || 'integration'}`,
        variant: "default",
      })
    }

    const handleIntegrationsUpdated = () => {
      // Refresh both integrations and metrics
      refreshIntegrations(true)
      fetchMetrics()
    }

    // Add event listeners
    window.addEventListener('integration-connected', handleIntegrationConnected)
    window.addEventListener('integration-disconnected', handleIntegrationDisconnected)
    window.addEventListener('integration-reconnected', handleIntegrationReconnected)
    window.addEventListener('integrations-updated', handleIntegrationsUpdated)

    // Cleanup
    return () => {
      window.removeEventListener('integration-connected', handleIntegrationConnected)
      window.removeEventListener('integration-disconnected', handleIntegrationDisconnected)
      window.removeEventListener('integration-reconnected', handleIntegrationReconnected)
      window.removeEventListener('integrations-updated', handleIntegrationsUpdated)
    }
  }, [user, fetchMetrics, toast, refreshIntegrations])
  
  const handleRefresh = useCallback(() => {
    refreshIntegrations(true) // Force refresh
    fetchMetrics()
  }, [refreshIntegrations, fetchMetrics])

  const handleConnect = useCallback(
    async (providerId: string) => {
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to connect integrations.",
          variant: "destructive",
        })
        return
      }

      // Special handling for Teams integration
      if (providerId === 'teams') {
        try {
          // Check Teams access before attempting connection
          const debugResponse = await fetch('/api/integrations/debug-teams')
          const debugData = await debugResponse.json()
          
          if (debugData.success && debugData.debug.authInfo) {
            const authInfo = debugData.debug.authInfo
            
            if (!authInfo.authenticated) {
              toast({
                title: "Authentication Error",
                description: "Your session has expired. Please log in again to connect Teams integration.",
                variant: "destructive",
              })
              return
            }
            
            if (!authInfo.hasTeamsAccess) {
              toast({
                title: "Access Denied",
                description: "Teams integration requires a Business, Enterprise, or Admin plan. Please upgrade your account.",
                variant: "destructive",
              })
              return
            }
          }
        } catch (error) {
          console.error("Error checking Teams access:", error)
          toast({
            title: "Connection Error",
            description: "Unable to verify Teams access. Please try again.",
            variant: "destructive",
          })
          return
        }
      }

      try {
        const response = await fetch("/api/integrations/auth/generate-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: providerId, reconnect: true }),
        })

        const data = await response.json()

        if (!response.ok) {
          // Handle specific error cases
          if (response.status === 401) {
            toast({
              title: "Authentication Error",
              description: "Your session has expired. Please log in again.",
              variant: "destructive",
            })
            return
          } else if (response.status === 403) {
            toast({
              title: "Access Denied",
              description: data.error || "You don't have permission to connect this integration.",
              variant: "destructive",
            })
            return
          } else {
            toast({
              title: "Connection Error",
              description: data.error || "Could not generate authentication URL.",
              variant: "destructive",
            })
            return
          }
        }

        if (data.success && data.authUrl) {
          const width = 600
          const height = 700
          const left = window.screen.width / 2 - width / 2
          const top = window.screen.height / 2 - height / 2
          const popupName = `oauth_popup_${providerId}_${Date.now()}`
          const popup = window.open(
            data.authUrl,
            popupName,
            `width=${width},height=${height},left=${left},top=${top}`,
          )

          const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) {
              return
            }
            
            if (event.data.type === "oauth-success") {
              toast({
                title: "Integration Connected",
                description: `${event.data.provider || "Integration"} has been connected successfully.`,
                variant: "default",
              })
              // Force refresh integrations to show the new connection
              refreshIntegrations(true)
              fetchMetrics()
            } else if (event.data.type === "oauth-error") {
              toast({
                title: "Integration Error",
                description: event.data.message || "An unknown error occurred.",
                variant: "destructive",
              })
            } else if (event.data.type === "oauth-cancelled") {
              toast({
                title: "Connection Cancelled",
                description: "The OAuth connection was cancelled.",
                variant: "destructive",
              })
            }

            if (popup) popup.close()
            window.removeEventListener("message", handleMessage)
          }

          window.addEventListener("message", handleMessage)
        } else {
          toast({
            title: "Error",
            description: data.error || "Could not generate authentication URL.",
            variant: "destructive",
          })
        }
      } catch (error) {
        console.error("Connection error:", error)
        toast({
          title: "Error",
          description: "An unexpected error occurred. Please try again.",
          variant: "destructive",
        })
      }
    },
    [user, toast, refreshIntegrations],
  )

  const handleDisconnect = useCallback(
    async (integrationId: string) => {
      const integration = integrations.find((i) => i.id === integrationId)
      if (!integration) {
        toast({ title: "Error", description: "Integration not found.", variant: "destructive" })
        return
      }

      toast({
        title: `Disconnecting ${integration.provider}...`,
        description: "Please wait.",
      })

      try {
        const response = await fetch(`/api/integrations/${integrationId}`, { method: "DELETE" })
        const data = await response.json()

        if (data.success) {
          toast({
            title: "Disconnected",
            description: `${integration.provider} has been successfully disconnected.`,
          })
          refreshIntegrations()
          fetchMetrics()
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
          description: "An unexpected error occurred while disconnecting.",
          variant: "destructive",
        })
      }
    },
    [integrations, refreshIntegrations, toast],
  )

  const handleApiKeyConnect = async (providerId: string, apiKey: string) => {
    try {
      setLoading(`connect-${providerId}`, true)
      await connectApiKeyIntegration(providerId, apiKey)
    } catch (error: any) {
      console.error(`Failed to connect ${providerId}:`, error)
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(`connect-${providerId}`, false)
    }
  }

  // Only create minimal objects for filtering - don't spread entire objects
  const filteredProviderIds = useMemo(() => {
    return providers
      .filter(provider => {
        // Exclude AI Agent, Logic, and Control integrations
        if (["ai", "logic", "control"].includes(provider.id)) return false;

        // Apply search filter
        if (searchQuery && !provider.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }

        // Apply status filter
        if (activeFilter !== "all") {
          const integration = integrations.find(i => i.provider === provider.id);
          let status: "connected" | "expired" | "expiring" | "disconnected" = "disconnected";

          if (integration) {
            if (integration.status === "expired" || integration.status === "needs_reauthorization") {
              status = "expired";
            } else if (integration.expires_at) {
              const expiresAt = new Date(integration.expires_at);
              const now = new Date();
              const tenMinutesMs = 10 * 60 * 1000;
              const timeUntilExpiry = expiresAt.getTime() - now.getTime();

              if (expiresAt.getTime() < now.getTime()) {
                status = "expired";
              } else if (timeUntilExpiry < tenMinutesMs) {
                status = "expiring";
              } else {
                status = "connected";
              }
            } else {
              status = "connected";
            }
          }

          if (status !== activeFilter) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => ({ id: p.id, integration: integrations.find(i => i.provider === p.id) }));
  }, [providers, integrations, activeFilter, searchQuery])

  // Show loading state only during initial initialization
  if (isInitializing && providers.length === 0) {
    return (
      <AppLayout title="Integrations">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <LightningLoader size="xl" color="blue" className="mx-auto mb-4" />
            <p className="text-muted-foreground">Loading your integrations...</p>
          </div>
        </div>
      </AppLayout>
    )
  }
  
  const IntegrationGrid = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isInitializing && filteredProviderIds.length === 0 ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <div className="text-center">
              <LightningLoader size="lg" color="blue" className="mx-auto mb-2" />
              <p className="text-muted-foreground">Loading integrations...</p>
            </div>
          </div>
        ) : filteredProviderIds.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground">No integrations found matching your criteria.</p>
          </div>
        ) : (
          filteredProviderIds.map((p) => {
            const isConfigured = configuredClients[p.id] ?? false
            return (
              <IntegrationCardWrapper
                key={p.id}
                providerId={p.id}
                isConfigured={isConfigured}
                openGuideForProviderId={openGuideForProviderId}
                onOpenGuideChange={setOpenGuideForProviderId}
              />
            )
          })
        )}
      </div>
    )
  }

  // Extract the status summary content for reuse
  const StatusSummaryContent = () => (
    <Card className="shadow-sm rounded-lg border-border bg-card">
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg font-semibold text-card-foreground flex items-center gap-2">
          Integration Status
          {loadingMetrics && (
            <LightningLoader size="sm" className="text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 sm:space-y-4">
          <li className="flex justify-between items-center">
            <span className="flex items-center text-card-foreground">
              <Check className="w-4 h-4 mr-2 text-green-500" />
              <span className="text-sm sm:text-base font-medium">Connected</span>
            </span>
            <Badge variant="secondary" className="font-mono bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs sm:text-sm transition-all duration-300">
              {loadingMetrics ? '...' : metrics.connected}
            </Badge>
          </li>
          <li className="flex justify-between items-center">
            <span className="flex items-center text-card-foreground">
              <Bell className="w-4 h-4 mr-2 text-yellow-500" />
              <span className="text-sm sm:text-base font-medium">Expiring</span>
            </span>
            <Badge variant="secondary" className="font-mono bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 text-xs sm:text-sm transition-all duration-300">
              {loadingMetrics ? '...' : metrics.expiring}
            </Badge>
          </li>
          <li className="flex justify-between items-center">
            <span className="flex items-center text-card-foreground">
              <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
              <span className="text-sm sm:text-base font-medium">Expired</span>
            </span>
            <Badge variant="secondary" className="font-mono bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs sm:text-sm transition-all duration-300">
              {loadingMetrics ? '...' : metrics.expired}
            </Badge>
          </li>
          <li className="flex justify-between items-center">
            <span className="flex items-center text-card-foreground">
              <X className="w-4 h-4 mr-2 text-muted-foreground" />
              <span className="text-sm sm:text-base font-medium">Disconnected</span>
            </span>
            <Badge variant="secondary" className="font-mono bg-muted dark:bg-muted text-muted-foreground text-xs sm:text-sm transition-all duration-300">
              {loadingMetrics ? '...' : metrics.disconnected}
            </Badge>
          </li>
        </ul>
        <div className="border-t my-4 sm:my-6" />
        <div className="text-xs text-muted-foreground">
          <p>⚡ Auto-refreshes every 10 minutes and after extended absence</p>
          <p>🔄 Updates automatically when connecting/disconnecting integrations</p>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <AppLayout title="Integrations" subtitle="Manage your connections to third-party services.">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="flex justify-end mb-6 sm:mb-8">
          <Button 
            onClick={handleRefresh} 
            disabled={loading || loadingMetrics} 
            variant="outline"
            className="text-sm sm:text-base"
          >
            {(loading || loadingMetrics) ? (
              <>
                <LightningLoader size="sm" className="mr-2" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </>
            )}
          </Button>
        </div>

        <div className="lg:flex lg:gap-6 xl:gap-8">
          <main className="flex-1 min-h-[calc(100vh-200px)]">
            <div className="space-y-4 sm:space-y-6">
              <div className="relative">
                {/* Hidden dummy email field to trap browser autofill */}
                <input
                  type="email"
                  name="fake-email"
                  autoComplete="username"
                  style={{ display: 'none' }}
                  tabIndex={-1}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                <Input
                  type="search"
                  placeholder="Search integrations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 sm:pl-10 w-full h-9 sm:h-11 text-sm sm:text-base"
                  autoComplete="off"
                  name="integration-search"
                  autoCorrect="off"
                />
              </div>

              <Tabs value={activeFilter} onValueChange={(value) => setActiveFilter(value as any)} className="w-full">
                <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:flex sm:flex-row gap-1 sm:gap-2 p-1">
                  <TabsTrigger value="all" className="flex-1 sm:flex-none text-xs sm:text-sm">All</TabsTrigger>
                  <TabsTrigger value="connected" className="flex-1 sm:flex-none text-xs sm:text-sm">Connected</TabsTrigger>
                  <TabsTrigger value="expiring" className="flex-1 sm:flex-none text-xs sm:text-sm">Expiring Soon</TabsTrigger>
                  <TabsTrigger value="expired" className="flex-1 sm:flex-none text-xs sm:text-sm">Expired</TabsTrigger>
                  <TabsTrigger value="disconnected" className="flex-1 sm:flex-none text-xs sm:text-sm">Disconnected</TabsTrigger>
                </TabsList>
              </Tabs>

              <IntegrationGrid />

              {/* Mobile: Status summary at the bottom */}
              <div className="block lg:hidden mt-6">
                <StatusSummaryContent />
              </div>
            </div>
          </main>
          {/* Desktop: Sticky status summary sidebar */}
          <aside className="hidden lg:block lg:w-72 xl:w-80 lg:pl-6 xl:pl-8 mt-6 lg:mt-0">
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <StatusSummaryContent />
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  )
}

export default IntegrationsContent
