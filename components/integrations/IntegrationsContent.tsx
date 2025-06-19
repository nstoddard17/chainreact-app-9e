"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import AppLayout from "@/components/layout/AppLayout"
import { IntegrationCard } from "./IntegrationCard"
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

function IntegrationsContent() {
  const [activeTab, setActiveTab] = useState<"all" | "connected" | "expiring" | "expired" | "disconnected">("all")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [isInitializing, setIsInitializing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [openGuideForProviderId, setOpenGuideForProviderId] = useState<string | null>(null)
  const { toast } = useToast()

  const { integrations, providers, initializeProviders, fetchIntegrations, loading } = useIntegrationStore()
  const { user } = useAuthStore()
  const router = useRouter()

  // Initialize providers and fetch integrations
  useEffect(() => {
    const initialize = async () => {
      // Only initialize if providers are empty and not already initializing
      if (providers.length === 0 && !isInitializing) {
        setIsInitializing(true)
        // Ensure providers are initialized before fetching integrations
        await initializeProviders()
        if (user) {
          await fetchIntegrations(true)
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
      fetchIntegrations(true)
    }
  }, [user, providers.length, isInitializing, fetchIntegrations])

  // Refresh when navigating to integrations page
  useEffect(() => {
    if (!user || !autoRefresh) return

    // Check if we're on the integrations page
    const isOnIntegrationsPage = typeof window !== 'undefined' && window.location.pathname === '/integrations'
    
    if (isOnIntegrationsPage && providers.length > 0) {
      console.log("🔄 On integrations page, refreshing integrations...")
      fetchIntegrations(true)
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
        duration: 2000
      })
      fetchIntegrations(true)
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
          duration: 2000
        })
        fetchIntegrations(true)
      }
    }

    const handleWindowFocus = () => {
      if (autoRefresh) {
        console.log("🔄 Window focused, refreshing integrations...")
        toast({ 
          title: "Refreshing integrations", 
          description: "Checking for updates...",
          duration: 2000
        })
        fetchIntegrations(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [user, autoRefresh, fetchIntegrations, toast])

  const handleRefreshTokens = useCallback(async () => {
    toast({ title: "Refreshing tokens...", description: "This may take a moment." })
    await fetchIntegrations(true)
    toast({ title: "Success", description: "All tokens have been refreshed." })
  }, [fetchIntegrations, toast])

  const providersWithStatus = useMemo(() => {
    if (!providers || providers.length === 0) return []

    return providers.map((provider) => {
      const integration = integrations.find((i) => i.provider === provider.id)
      const now = new Date()
      const expiresAt = integration?.expires_at ? new Date(integration.expires_at) : null
      let status: "connected" | "expired" | "expiring" | "disconnected" | "needs_reauthorization" = "disconnected"

      if (integration) {
        if (integration.status === "needs_reauthorization") {
          status = "needs_reauthorization"
        } else if (integration.status === "expired") {
          status = "expired"
        } else if (integration.status === "connected") {
          if (expiresAt) {
            const expiryTimestamp = expiresAt.getTime()
            const nowTimestamp = now.getTime()
            const diffMs = expiryTimestamp - nowTimestamp
            const tenMinutesMs = 10 * 60 * 1000

            if (diffMs <= 0) {
              // Only needs reauth if no refresh token
              if (!integration.refresh_token) {
                status = "needs_reauthorization"
              } else {
                status = "expired"
              }
            } else if (diffMs < tenMinutesMs) {
              status = "expiring"
            } else {
              status = "connected"
            }
          } else {
            status = "connected"
          }
        } else if (integration.status === "disconnected") {
          status = "disconnected"
        } else {
          status = "disconnected"
        }
      }

      return {
        ...provider,
        integration,
        status,
      }
    })
  }, [providers, integrations])

  const { connected, expiring, disconnected, expired } = useMemo(() => {
    return providersWithStatus.reduce(
      (counts, p) => {
        if (p.status === "connected") counts.connected++
        else if (p.status === "expiring") counts.expiring++
        else if (p.status === "expired") counts.expired++
        else counts.disconnected++
        return counts
      },
      { connected: 0, expiring: 0, disconnected: 0, expired: 0 }
    )
  }, [providersWithStatus])

  const { lastRefreshTime } = useIntegrationStore()

  const filteredProviders = useMemo(() => {
    let filtered = providersWithStatus

    if (activeTab !== "all") {
      filtered = filtered.filter((p) => p.status === activeTab)
    }

    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(lowercasedQuery) ||
          p.description?.toLowerCase().includes(lowercasedQuery)
      )
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }, [activeTab, searchQuery, providersWithStatus])

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
            const CardComponent = p.authType === "apiKey" ? ApiKeyIntegrationCard : IntegrationCard
            if (p.authType === "apiKey") {
              return (
                <ApiKeyIntegrationCard
                  key={p.id}
                  provider={p}
                  integration={p.integration || null}
                  status={p.status as any}
                  open={openGuideForProviderId === p.id}
                  onOpenChange={(open: boolean) => setOpenGuideForProviderId(open ? p.id : null)}
                />
              )
            } else {
              return (
                <IntegrationCard
                  key={p.id}
                  provider={p}
                  integration={p.integration || null}
                  status={p.status as any}
                />
              )
            }
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
          {lastRefreshTime && (
            <div className="text-xs text-gray-500">
              Last updated: {new Date(lastRefreshTime).toLocaleTimeString()}
            </div>
          )}
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

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                  connected={connected}
                  expiring={expiring}
                  expired={expired}
                  disconnected={disconnected}
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
                connected={connected}
                expiring={expiring}
                expired={expired}
                disconnected={disconnected}
              />
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  )
}

export default IntegrationsContent
