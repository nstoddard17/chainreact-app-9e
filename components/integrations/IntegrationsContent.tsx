"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useIntegrationStore, Integration } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import AppLayout from "@/components/layout/AppLayout"
import { IntegrationCard } from "@/components/integrations/IntegrationCard"
import { ApiKeyIntegrationCard } from "./ApiKeyIntegrationCard"
import { Loader2, RefreshCw, Bell, Check, X, Search, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
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
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [autoRefreshOnTabSwitch, setAutoRefreshOnTabSwitch] = useState(() => {
    // Initialize from localStorage if available, default to true
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('autoRefreshOnTabSwitch');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
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
    connectIntegration,
    disconnectIntegration,
    reconnectIntegration,
    connectApiKeyIntegration,
    setLoading,
  } = useIntegrationStore()
  const { user } = useAuthStore()
  const router = useRouter()

  // Save autoRefreshOnTabSwitch to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('autoRefreshOnTabSwitch', autoRefreshOnTabSwitch.toString());
    }
  }, [autoRefreshOnTabSwitch]);

  // Add visibility change listener to detect tab switching
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // User switched away from this tab
        setWasHidden(true);
      } else if (document.visibilityState === 'visible' && wasHidden && autoRefreshOnTabSwitch) {
        // User returned to this tab after switching away and auto-refresh is enabled
        console.log('User returned to integrations tab - refreshing page to restore popup functionality');
        // Show a brief toast notification
        toast({
          title: "Refreshing page",
          description: "Refreshing to ensure integrations work properly",
          duration: 2000,
        });
        
        // Give the toast time to display before refreshing
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [wasHidden, toast, autoRefreshOnTabSwitch]);

  useEffect(() => {
    if (providers.length === 0) {
      initializeProviders()
    }
  }, [providers.length, initializeProviders])

  useEffect(() => {
    console.log("🔍 IntegrationsContent useEffect", { user: !!user, loading, providersLength: providers.length })
    if (user && providers.length > 0) {
      console.log("👤 User found and providers initialized, calling fetchIntegrations and fetchMetrics")
      // Add a small delay to ensure the store is properly initialized
      const timer = setTimeout(() => {
        console.log("⏱️ Timeout elapsed, calling fetchIntegrations from useEffect")
        fetchIntegrations(true) // Force refresh
        fetchMetrics()
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [user, providers.length, fetchIntegrations])

  // Add a fallback to prevent infinite loading
  useEffect(() => {
    if (loading && user) {
      const timeout = setTimeout(() => {
        console.warn("⚠️ Integration loading timeout - forcing refresh")
        setLoading("global", false)
        fetchIntegrations(true)
      }, 30000) // 30 second timeout
      
      return () => clearTimeout(timeout)
    }
  }, [loading, user, fetchIntegrations])

  const fetchMetrics = async () => {
    if (!user) return
    
    try {
      setLoadingMetrics(true)
      const response = await fetch("/api/analytics/integration-metrics")
      if (!response.ok) {
        throw new Error("Failed to fetch integration metrics")
      }
      
      const data = await response.json()
      if (data.success && data.data) {
        setMetrics(data.data)
      }
    } catch (error) {
      console.error("Error fetching integration metrics:", error)
    } finally {
      setLoadingMetrics(false)
    }
  }

  // Auto-refresh metrics when integrations change
  useEffect(() => {
    if (user && integrations.length > 0) {
      // Refresh metrics whenever integrations change
      fetchMetrics()
    }
  }, [integrations, user])

  // Set up periodic refresh for metrics (every 30 seconds)
  useEffect(() => {
    if (!user || !autoRefresh) return

    const interval = setInterval(() => {
      fetchMetrics()
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [user, autoRefresh])

  // Listen for integration change events
  useEffect(() => {
    if (!user) return

    const handleIntegrationConnected = (event: Event) => {
      const customEvent = event as CustomEvent
      console.log('🔄 Integration connected event received, refreshing metrics')
      fetchMetrics()
      toast({
        title: "Integration Connected",
        description: `Successfully connected ${customEvent.detail?.providerId || 'integration'}`,
        variant: "default",
      })
    }

    const handleIntegrationDisconnected = (event: Event) => {
      const customEvent = event as CustomEvent
      console.log('🔄 Integration disconnected event received, refreshing metrics')
      fetchMetrics()
      toast({
        title: "Integration Disconnected",
        description: `Successfully disconnected ${customEvent.detail?.provider || 'integration'}`,
        variant: "default",
      })
    }

    const handleIntegrationReconnected = (event: Event) => {
      const customEvent = event as CustomEvent
      console.log('🔄 Integration reconnected event received, refreshing metrics')
      fetchMetrics()
      toast({
        title: "Integration Reconnected",
        description: `Successfully reconnected ${customEvent.detail?.provider || 'integration'}`,
        variant: "default",
      })
    }

    const handleIntegrationsUpdated = () => {
      console.log('🔄 Integrations updated event received, refreshing metrics')
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
  }, [user, fetchMetrics, toast])
  
  const handleRefresh = () => {
    console.log("🔄 Manual refresh requested by user")
    fetchIntegrations(true) // Force refresh
    fetchMetrics()
  }

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

      try {
        const response = await fetch("/api/integrations/auth/generate-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: providerId, reconnect: true }),
        })

        const data = await response.json()

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
            
            console.log("📨 Received OAuth message:", event.data)
            console.log("📨 Message origin:", event.origin)
            console.log("📨 Current origin:", window.location.origin)
            
            if (event.data.type === "oauth-success") {
              console.log("✅ OAuth success message received, refreshing integrations")
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
    return providers.map((provider) => {
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
    
    // Debug log to help diagnose the discrepancy
    if (activeFilter === "expiring") {
      console.log(`Expiring filter active: ${filtered.length} items shown, metrics reports ${metrics.expiring}`)
      console.log("Expiring items:", filtered.map(p => ({
        name: p.name,
        expires_at: p.integration?.expires_at,
        timeLeft: p.integration?.expires_at ? 
          new Date(p.integration.expires_at).getTime() - new Date().getTime() : 'N/A'
      })))
    }
    
    return filtered
  }, [providersWithStatus, activeFilter, searchQuery, metrics.expiring])

  if (isInitializing && !providers.length) {
    return (
      <AppLayout title="Loading...">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading your integrations...</p>
          </div>
        </div>
      </AppLayout>
    )
  }
  
  const IntegrationGrid = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading && filteredProviders.length === 0 ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
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
                    console.log("🔄 Calling reconnectIntegration for:", p.integration.id)
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
  const StatusSummaryContent = ({ 
    autoRefresh, 
    setAutoRefresh,
    autoRefreshOnTabSwitch,
    setAutoRefreshOnTabSwitch 
  }: {
    autoRefresh: boolean;
    setAutoRefresh: (value: boolean) => void;
    autoRefreshOnTabSwitch: boolean;
    setAutoRefreshOnTabSwitch: (value: boolean) => void;
  }) => (
    <Card className="shadow-sm rounded-lg border-border bg-card">
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg font-semibold text-card-foreground flex items-center gap-2">
          Integration Status
          {loadingMetrics && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-refresh" className="text-xs sm:text-sm font-medium text-card-foreground">
              Auto-refresh tokens
            </Label>
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
          
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="auto-refresh-tab" className="text-xs sm:text-sm font-medium text-card-foreground">
              <div>
                <span>Auto-refresh on tab switch</span>
                <p className="text-xs text-muted-foreground mt-1">Refreshes page when returning to this tab to fix popup issues</p>
              </div>
            </Label>
            <Switch id="auto-refresh-tab" checked={autoRefreshOnTabSwitch} onCheckedChange={setAutoRefreshOnTabSwitch} />
          </div>
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                <StatusSummaryContent
                  autoRefresh={autoRefresh}
                  setAutoRefresh={setAutoRefresh}
                  autoRefreshOnTabSwitch={autoRefreshOnTabSwitch}
                  setAutoRefreshOnTabSwitch={setAutoRefreshOnTabSwitch}
                />
              </div>
            </div>
          </main>
          {/* Desktop: Sticky status summary sidebar */}
          <aside className="hidden lg:block lg:w-72 xl:w-80 lg:pl-6 xl:pl-8 mt-6 lg:mt-0">
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <StatusSummaryContent
                autoRefresh={autoRefresh}
                setAutoRefresh={setAutoRefresh}
                autoRefreshOnTabSwitch={autoRefreshOnTabSwitch}
                setAutoRefreshOnTabSwitch={setAutoRefreshOnTabSwitch}
              />
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  )
}

export default IntegrationsContent
