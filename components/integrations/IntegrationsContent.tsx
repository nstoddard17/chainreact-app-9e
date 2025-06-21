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
import { availableIntegrations, IntegrationProvider, INTEGRATION_CONFIGS, IntegrationConfig } from "@/lib/integrations/availableIntegrations"
import { Zap, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"

interface IntegrationsContentProps {
  configuredClients: Record<string, boolean>
}

function IntegrationsContent({ configuredClients }: IntegrationsContentProps) {
  const [activeFilter, setActiveFilter] = useState<"all" | "connected" | "expiring" | "expired" | "disconnected">("all")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [isInitializing, setIsInitializing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [openGuideForProviderId, setOpenGuideForProviderId] = useState<string | null>(null)
  const { toast } = useToast()

  const { integrations, providers, initializeProviders, fetchIntegrations, loading, needsReauthorization, clearStore } = useIntegrationStore()
  const { user, session } = useAuthStore()
  const router = useRouter()

  // Initialize providers and fetch integrations
  useEffect(() => {
    const initialize = async () => {
      // Only initialize if providers are empty and not already initializing
      if (providers.length === 0 && !isInitializing) {
        setIsInitializing(true)
        // Ensure providers are initialized before fetching integrations
        await initializeProviders(INTEGRATION_CONFIGS)
        if (user) {
          await fetchIntegrations()
        }
        setIsInitializing(false)
      }
    }
    initialize()
  }, [user, initializeProviders, fetchIntegrations, providers.length, isInitializing])

  // Refresh integrations when component mounts and user is authenticated
  useEffect(() => {
    if (user && providers.length > 0 && !isInitializing) {
      console.log("🔄 Component mounted, refreshing integrations...")
      fetchIntegrations()
    }
  }, [user, providers.length, isInitializing, fetchIntegrations])

  // Refresh when navigating to integrations page
  useEffect(() => {
    if (!user || !autoRefresh) return

    // Check if we're on the integrations page
    const isOnIntegrationsPage = typeof window !== "undefined" && window.location.pathname === "/integrations"

    if (isOnIntegrationsPage && providers.length > 0) {
      console.log("🔄 On integrations page, refreshing integrations...")
      fetchIntegrations()
    }
  }, [user, autoRefresh, providers.length, fetchIntegrations])

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !user) return

    const interval = setInterval(() => {
      console.log("🔄 Auto-refreshing integrations...")
      toast({
        title: "Refreshing integrations",
        description: "Checking for updates...",
        duration: 2000,
      })
      fetchIntegrations()
    }, 300000) // Refresh every 5 minutes when auto-refresh is enabled

    return () => clearInterval(interval)
  }, [autoRefresh, user, fetchIntegrations, toast])

  // Refresh when page becomes visible (user returns to tab)
  useEffect(() => {
    if (!user) return

    const handleVisibilityChange = () => {
      if (!document.hidden && autoRefresh) {
        console.log("🔄 Page became visible, refreshing integrations...")
        toast({
          title: "Refreshing integrations",
          description: "Checking for updates...",
          duration: 2000,
        })
        fetchIntegrations()
      }
    }

    const handleWindowFocus = () => {
      if (autoRefresh) {
        console.log("🔄 Window focused, refreshing integrations...")
        toast({
          title: "Refreshing integrations",
          description: "Checking for updates...",
          duration: 2000,
        })
        fetchIntegrations()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleWindowFocus)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleWindowFocus)
    }
  }, [user, autoRefresh, fetchIntegrations, toast])

  const handleRefreshTokens = useCallback(async () => {
    toast({ title: "Refreshing tokens...", description: "This may take a moment." })
    await fetchIntegrations()
    toast({ title: "Success", description: "All tokens have been refreshed." })
  }, [fetchIntegrations, toast])

  const providersWithStatus = useMemo(() => {
    if (!providers || providers.length === 0) return []

    return providers.map((provider) => {
      const integration = integrations.find((i) => i.provider === provider.id)
      let status: "connected" | "expired" | "expiring" | "disconnected" = "disconnected"

      if (integration) {
        // Prioritize expires_at for status calculation if it exists
        if (integration.expires_at) {
          let expiresAtDate: Date;
          const expiresAt = integration.expires_at;

          // Check if it's a numeric string (unix timestamp in seconds)
          if (/^\d+$/.test(expiresAt)) {
            expiresAtDate = new Date(parseInt(expiresAt, 10) * 1000);
          } else {
            expiresAtDate = new Date(expiresAt);
          }

          if (expiresAtDate && !isNaN(expiresAtDate.getTime())) {
            const now = new Date();
            const diffMs = expiresAtDate.getTime() - now.getTime();
            // Integrations are marked as "expiring" if they expire within 10 minutes
            const tenMinutesMs = 10 * 60 * 1000;

            if (diffMs <= 0) {
              status = "expired";
            } else if (diffMs < tenMinutesMs) {
              status = "expiring";
            } else {
              status = "connected";
            }

          } else {
            // Fallback for invalid date
            if (integration.status === 'connected') {
              status = "connected";
            } else if (integration.status === 'expired') {
              status = "expired";
            }
          }
        } else if (integration.status === 'connected') {
          // Fallback for integrations without an expiry date (e.g., API keys)
          status = "connected"
        } else if (integration.status === 'expired') {
            status = "expired"
        }
      }

      return {
        ...provider,
        integration,
        status,
      }
    })
  }, [providers, integrations])

  const providerCounts = useMemo(() => {
    return providersWithStatus.reduce((counts, p) => {
      const status = p.status
      counts[status] = (counts[status] || 0) + 1
      return counts
    }, {} as Record<"connected" | "expired" | "expiring" | "disconnected" | "needs_reauthorization", number>)
  }, [providersWithStatus])

  const sortedProviders = useMemo(() => {
    const statusOrder = {
      "needs_reauthorization": 1,
      "expired": 2,
      "expiring": 3,
      "connected": 4,
      "disconnected": 5,
    }

    return [...providersWithStatus].sort((a, b) => {
      const statusA = a.status
      const statusB = b.status
      return (statusOrder[statusA] || 99) - (statusOrder[statusB] || 99)
    })
  }, [providersWithStatus])

  const filteredProviders = sortedProviders.filter(p => {
    const searchTermLower = searchQuery.toLowerCase()
    const statusLower = activeFilter.toLowerCase()

    const nameMatch = p.name.toLowerCase().includes(searchTermLower)

    if (statusLower !== 'all') {
      const statusMatch = statusLower === p.status
      return nameMatch && statusMatch
    }
    return nameMatch
  })

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
          body: JSON.stringify({ provider: providerId }),
        })

        const data = await response.json()

        if (data.success && data.authUrl) {
          router.push(data.authUrl)
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
    [user, router, toast],
  )

  const handleDisconnect = useCallback(
    async (integrationId: string) => {
      // Find the integration to get the provider name
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
          fetchIntegrations() // Refresh the list
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
    console.log(`Connecting ${providerId} with API key...`)
    // Implement API key connection logic here
  }

  if (isInitializing && !providers.length) {
    return (
      <AppLayout title="Loading...">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading your integrations...</p>
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
              <p className="text-gray-600">Loading integrations...</p>
            </div>
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-gray-600">No integrations found matching your criteria.</p>
          </div>
        ) : (
          filteredProviders.map((p) => {
            const isConfigured = configuredClients[p.id] ?? false
            if (p.authType === "apiKey") {
              return (
                <ApiKeyIntegrationCard
                  key={p.id}
                  provider={p}
                  integration={p.integration}
                  onConnect={(apiKey: string) => handleApiKeyConnect(p.id, apiKey)}
                  onDisconnect={() => (p.integration ? handleDisconnect(p.integration.id) : {})}
                  isLoading={loading}
                />
              )
            }
            return (
              <IntegrationCard
                key={p.id}
                config={p}
                isConnected={!!p.integration}
                isConfigured={isConfigured}
                onConnect={() => handleConnect(p.id)}
                onDisconnect={() => (p.integration ? handleDisconnect(p.integration.id) : {})}
                onManage={() => {
                  /* Implement manage logic */
                }}
              />
            )
          })
        )}
      </div>
    )
  }

  // Extract the status summary content for reuse
  const StatusSummaryContent = ({ autoRefresh, setAutoRefresh, connected, expiring, expired, disconnected }: any) => (
    <Card className="shadow-sm rounded-lg border-gray-200">
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg font-semibold">Integration Status</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 sm:space-y-4">
          <li className="flex justify-between items-center">
            <span className="flex items-center text-gray-700">
              <Check className="w-4 h-4 mr-2 text-green-500" />
              <span className="text-sm sm:text-base font-medium">Connected</span>
            </span>
            <Badge variant="secondary" className="font-mono bg-green-50 text-green-700 text-xs sm:text-sm">
              {connected}
            </Badge>
          </li>
          <li className="flex justify-between items-center">
            <span className="flex items-center text-gray-700">
              <Bell className="w-4 h-4 mr-2 text-yellow-500" />
              <span className="text-sm sm:text-base font-medium">Expiring</span>
            </span>
            <Badge variant="secondary" className="font-mono bg-yellow-50 text-yellow-700 text-xs sm:text-sm">
              {expiring}
            </Badge>
          </li>
          <li className="flex justify-between items-center">
            <span className="flex items-center text-gray-700">
              <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
              <span className="text-sm sm:text-base font-medium">Expired</span>
            </span>
            <Badge variant="secondary" className="font-mono bg-red-50 text-red-700 text-xs sm:text-sm">
              {expired}
            </Badge>
          </li>
          <li className="flex justify-between items-center">
            <span className="flex items-center text-gray-700">
              <X className="w-4 h-4 mr-2 text-gray-400" />
              <span className="text-sm sm:text-base font-medium">Disconnected</span>
            </span>
            <Badge variant="secondary" className="font-mono bg-gray-50 text-gray-700 text-xs sm:text-sm">
              {disconnected}
            </Badge>
          </li>
        </ul>
        <div className="border-t my-4 sm:my-6" />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-refresh" className="text-xs sm:text-sm font-medium text-gray-700">
              Auto-refresh tokens
            </Label>
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <AppLayout title="Integrations">
      <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Integrations</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage your connections to third-party services.</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleRefreshTokens} 
              disabled={loading} 
              variant="outline"
              className="w-full sm:w-auto text-sm sm:text-base"
            >
              {loading ? (
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
                  connected={providerCounts.connected || 0}
                  expiring={providerCounts.expiring || 0}
                  expired={providerCounts.expired || 0}
                  disconnected={providerCounts.disconnected || 0}
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
                connected={providerCounts.connected || 0}
                expiring={providerCounts.expiring || 0}
                expired={providerCounts.expired || 0}
                disconnected={providerCounts.disconnected || 0}
              />
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  )
}

export default IntegrationsContent
