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
  const lastFetchTimeRef = React.useRef(0)
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

  // Debounced fetch to prevent duplicate calls within 3 seconds
  const debouncedFetchIntegrations = useCallback((force: boolean = false) => {
    const now = Date.now()
    const timeSinceLastFetch = now - lastFetchTimeRef.current

    // Only fetch if it's been more than 3 seconds since last fetch
    // OR if force is true and it's been more than 1000ms (allow rapid force refreshes with 1s cooldown)
    if (force && timeSinceLastFetch > 1000) {
      lastFetchTimeRef.current = now
      return fetchIntegrations(true)
    } else if (!force && timeSinceLastFetch > 3000) {
      lastFetchTimeRef.current = now
      return fetchIntegrations(false)
    } 
      console.log(`⏭️ Skipping duplicate fetchIntegrations call (${timeSinceLastFetch}ms since last fetch)`)
      return Promise.resolve()
    
  }, [fetchIntegrations])

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
  // IMPORTANT: Only runs AFTER initial load (when initialFetchSettled is true)
  useEffect(() => {
    // Don't set up listener until initial fetch is complete
    if (!initialFetchSettled) return;

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
          debouncedFetchIntegrations(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasHidden, initialFetchSettled]); // Only activate after initial fetch

  // Listen for OAuth completion events to immediately refresh integrations
  // IMPORTANT: Only runs AFTER initial load (when initialFetchSettled is true)
  useEffect(() => {
    // Don't set up listener until initial fetch is complete
    if (!initialFetchSettled) return;

    const handleOAuthComplete = (event: MessageEvent) => {
      if (event.data?.type === 'oauth-complete' && event.data?.success) {
        console.log(`✅ OAuth completed for ${event.data.provider}, refreshing integrations...`);
        debouncedFetchIntegrations(true);
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
          debouncedFetchIntegrations(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFetchSettled]); // Only activate after initial fetch

  // Initialize providers and integrations on mount if user is authenticated
  useEffect(() => {
    if (!user) return

    // Initialize everything in parallel for faster loading
    const initializeData = async () => {
      // Prevent duplicate initialization
      if (isInitializing) return

      try {
        setIsInitializing(true)

        // Initialize providers first (required for UI) and WAIT for it
        // This ensures providers are available before rendering cards
        if (providers.length === 0) {
          await initializeProviders().catch(error => {
            console.warn("Provider initialization failed:", error)
            // Still continue - will show empty state
          })
        }

        // After providers are loaded, fetch integrations and metrics in parallel
        // These can be non-blocking since cards will show "Connect" state
        Promise.all([
          debouncedFetchIntegrations(true).catch(error => {
            console.warn("Integration fetch failed (non-critical):", error)
          }),
          fetchMetrics().catch(error => {
            console.warn("Metrics fetch failed (non-critical):", error)
          })
        ]).finally(() => {
          setInitialFetchSettled(true)
        })

        // Reset initializing flag after providers are loaded
        setIsInitializing(false)

      } catch (error) {
        console.error("Error during integration initialization:", error)
        setIsInitializing(false)
        setInitialFetchSettled(true)
      }
    }

    // Start initialization immediately
    initializeData()

    // Fallback settle in case something gets stuck
    const fallbackTimeout = setTimeout(() => {
      setInitialFetchSettled(true)
      if (isInitializing) {
        setIsInitializing(false)
      }
    }, 5000) // 5 second fallback

    return () => clearTimeout(fallbackTimeout)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]) // Only depend on user to avoid re-running

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
          debouncedFetchIntegrations(true).catch(() => {
            // If recovery fails, just reset states
            setLoading("integrations", false)
            setLoading("providers", false)
            setLoading("global", false)
          })
        }
      }, 30000) // 30 second timeout for connections, increased from 15

      return () => clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadingStates, user]) // Removed setLoading, fetchIntegrations, toast - they're stable

  // Auto-refresh metrics when integrations change (debounced to reduce excessive calls)
  // IMPORTANT: Only runs AFTER initial load (when initialFetchSettled is true)
  useEffect(() => {
    if (user && integrations.length > 0 && initialFetchSettled) {
      // Debounce metrics fetching to avoid excessive API calls
      const timeoutId = setTimeout(() => {
        fetchMetrics()
      }, 300) // Reduced to 300ms for faster updates while still debouncing

      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrations.length, user, initialFetchSettled]) // Only activate after initial fetch

  // Smart periodic refresh - only check for expiring tokens every 10 minutes
  useEffect(() => {
    if (!user) return

    const interval = setInterval(() => {
      // Only refresh metrics to check for token expiration
      fetchMetrics()
    }, 600000) // 10 minutes - less aggressive

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]) // Removed fetchMetrics - it's stable from Zustand

  // Listen for integration change events
  // IMPORTANT: Only runs AFTER initial load (when initialFetchSettled is true)
  useEffect(() => {
    if (!user || !initialFetchSettled) return

    const handleIntegrationConnected = (event: Event) => {
      const customEvent = event as CustomEvent
      // Immediately refresh integrations to show the new connection
      debouncedFetchIntegrations(true)
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
      debouncedFetchIntegrations(true)
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
      debouncedFetchIntegrations(true)
      fetchMetrics()
      toast({
        title: "Integration Reconnected",
        description: `Successfully reconnected ${customEvent.detail?.provider || 'integration'}`,
        variant: "default",
      })
    }

    const handleIntegrationsUpdated = () => {
      // Refresh both integrations and metrics
      debouncedFetchIntegrations(true)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, initialFetchSettled]) // Only activate after initial fetch
  
  const handleRefresh = useCallback(() => {
    debouncedFetchIntegrations(true) // Force refresh
    fetchMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps - fetchIntegrations and fetchMetrics are stable from Zustand

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
          } 
            toast({
              title: "Connection Error",
              description: data.error || "Could not generate authentication URL.",
              variant: "destructive",
            })
            return
          
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
              debouncedFetchIntegrations(true)
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
    [user, toast, debouncedFetchIntegrations, fetchMetrics],
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
          debouncedFetchIntegrations(false) // No force on disconnect
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
    [integrations, debouncedFetchIntegrations, toast, fetchMetrics],
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
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const providerConfig = INTEGRATION_CONFIGS[provider.id];

          // Check provider name
          if (provider.name.toLowerCase().includes(query)) return true;

          // Check provider description if available
          if (providerConfig?.description?.toLowerCase().includes(query)) return true;

          // Check searchKeywords if available (for OneDrive/Excel)
          if (providerConfig?.searchKeywords?.some(keyword => keyword.toLowerCase().includes(query))) return true;

          // Special case: if searching for "excel", show OneDrive
          if (provider.id === 'onedrive' && (query.includes('excel') || query.includes('spreadsheet') || query.includes('workbook'))) {
            return true;
          }

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
