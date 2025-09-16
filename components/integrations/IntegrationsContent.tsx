"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useIntegrationStore, Integration } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import AppLayout from "@/components/layout/AppLayout"
import { IntegrationCard } from "@/components/integrations/IntegrationCard"
import { ApiKeyIntegrationCard } from "./ApiKeyIntegrationCard"
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

  const {
    integrations,
    providers,
    initializeProviders,
    fetchIntegrations,
    loading,
    loadingStates,
    connectIntegration,
    disconnectIntegration,
    reconnectIntegration,
    connectApiKeyIntegration,
    setLoading,
  } = useIntegrationStore()
  const { user } = useAuthStore()
  const router = useRouter()

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
          fetchIntegrations(true);
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
  }, [wasHidden, fetchIntegrations, fetchMetrics]);

  // Listen for OAuth completion events to immediately refresh integrations
  useEffect(() => {
    const handleOAuthComplete = (event: MessageEvent) => {
      if (event.data?.type === 'oauth-complete' && event.data?.success) {
        console.log(`✅ OAuth completed for ${event.data.provider}, refreshing integrations...`);
        fetchIntegrations(true);
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
          fetchIntegrations(true);
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
  }, [fetchIntegrations, fetchMetrics]);

  // Initialize providers and integrations on mount if user is authenticated
  useEffect(() => {
    if (!user) return

    // Initialize everything in parallel for faster loading
    const initializeData = async () => {
      try {
        setIsInitializing(true)

        // Start both operations in parallel
        const promises = []

        // Initialize providers if not already loaded
        if (providers.length === 0) {
          promises.push(initializeProviders())
        }

        // Fetch integrations (always force refresh on initial load)
        promises.push(fetchIntegrations(true))

        // Fetch metrics
        promises.push(fetchMetrics())

        // Wait for all to complete (or fail)
        await Promise.allSettled(promises)

      } catch (error) {
        console.error("Error initializing integrations page:", error)
      } finally {
        setIsInitializing(false)
      }
    }

    initializeData()
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
          fetchIntegrations(true).catch(() => {
            // If recovery fails, just reset states
            setLoading("integrations", false)
            setLoading("providers", false)
            setLoading("global", false)
          })
        }
      }, 30000) // 30 second timeout for connections, increased from 15

      return () => clearTimeout(timeout)
    }
  }, [loading, loadingStates, user, setLoading, fetchIntegrations, toast])

  // Auto-refresh metrics when integrations change (debounced to reduce excessive calls)
  useEffect(() => {
    if (user && integrations.length > 0) {
      // Debounce metrics fetching to avoid excessive API calls
      const timeoutId = setTimeout(() => {
        fetchMetrics()
      }, 300) // Reduced to 300ms for faster updates while still debouncing
      
      return () => clearTimeout(timeoutId)
    }
  }, [integrations, user])

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
      fetchIntegrations(true)
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
      fetchIntegrations(true)
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
      fetchIntegrations(true)
      fetchMetrics()
      toast({
        title: "Integration Reconnected",
        description: `Successfully reconnected ${customEvent.detail?.provider || 'integration'}`,
        variant: "default",
      })
    }

    const handleIntegrationsUpdated = () => {
      // Refresh both integrations and metrics
      fetchIntegrations(true)
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
  }, [user, fetchMetrics, toast, fetchIntegrations])
  
  const handleRefresh = useCallback(() => {
    fetchIntegrations(true) // Force refresh
    fetchMetrics()
  }, [fetchIntegrations, fetchMetrics])

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
              fetchIntegrations(true)
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
    [user, toast, fetchIntegrations],
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
          fetchIntegrations()
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
    [integrations, fetchIntegrations, toast],
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

  const providersWithStatus = useMemo(() => {
    const result = providers.map((provider) => {
      const integration = integrations.find((i) => i.provider === provider.id)
      const config = INTEGRATION_CONFIGS[provider.id] || {}
      let status: "connected" | "expired" | "expiring" | "disconnected" = "disconnected"

      if (integration) {
        if (integration.status === "expired" || integration.status === "needs_reauthorization") {
          status = "expired"
        } else if (integration.expires_at) {
          const expiresAt = new Date(integration.expires_at)
          const now = new Date()
          const tenMinutesMs = 10 * 60 * 1000 // 10 minutes in milliseconds
          const timeUntilExpiry = expiresAt.getTime() - now.getTime()
          
          if (expiresAt.getTime() < now.getTime()) {
            status = "expired"
          } else if (timeUntilExpiry < tenMinutesMs) {
            status = "expiring"
          } else {
            status = "connected"
          }
        } else {
          status = "connected"
        }
      }

      return {
        ...config,
        ...provider,
        integration,
        status,
      }
    })

    return result
  }, [providers, integrations])

  const filteredProviders = useMemo(() => {
    const filtered = providersWithStatus
      .filter((p) => {
        // Exclude AI Agent, Logic, and Control integrations
        if (["ai", "logic", "control"].includes(p.id)) return false;
        if (activeFilter !== "all" && p.status !== activeFilter) {
          return false
        }
        if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false
        }
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    
    return filtered
  }, [providersWithStatus, activeFilter, searchQuery, metrics.expiring])

  // Show loading state only for the initial load when we have no data
  if ((isInitializing || loading) && providers.length === 0 && integrations.length === 0) {
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
        {(loading || loadingStates?.['providers'] || loadingStates?.['integrations']) && filteredProviders.length === 0 ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <div className="text-center">
              <LightningLoader size="lg" color="blue" className="mx-auto mb-2" />
              <p className="text-muted-foreground">Loading integrations...</p>
            </div>
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground">No integrations found matching your criteria.</p>
          </div>
        ) : (
          filteredProviders.map((p) => {
            const isConfigured = configuredClients[p.id] ?? false
            if (p.authType === "apiKey") {
              return (
                <ApiKeyIntegrationCard
                  key={p.id}
                  provider={p}
                  integration={p.integration ?? null}
                  status={p.status === "connected" || p.status === "expiring" ? p.status : "disconnected"}
                  open={openGuideForProviderId === p.id}
                  onOpenChange={(isOpen) => setOpenGuideForProviderId(isOpen ? p.id : null)}
                />
              )
            }
            return (
              <IntegrationCard
                key={p.id}
                provider={p as IntegrationConfig}
                integration={p.integration ?? null}
                status={p.status}
                isConfigured={isConfigured}
                onConnect={() => connectIntegration(p.id)}
                onDisconnect={() => {
                  if (p.integration) {
                    disconnectIntegration(p.integration.id)
                  }
                }}
                onReconnect={() => {
                  if (p.integration) {
                    reconnectIntegration(p.integration.id)
                  } else {
                    console.warn("⚠️ No integration found for reconnect")
                  }
                }}
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
      <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
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
