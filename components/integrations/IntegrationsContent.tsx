"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
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
  const [activeTab, setActiveTab] = useState("all")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [isInitializing, setIsInitializing] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const { toast } = useToast()

  const { integrations, providers, initializeProviders, fetchIntegrations, loading } = useIntegrationStore()
  const { user } = useAuthStore()

  useEffect(() => {
    const initialize = async () => {
      setIsInitializing(true)
      // Ensure providers are initialized before fetching integrations
      await initializeProviders()
      if (user) {
        await fetchIntegrations(true)
      }
      setIsInitializing(false)
    }
    initialize()
  }, [user, initializeProviders, fetchIntegrations])

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
      let status: "connected" | "expired" | "expiring" | "disconnected" = "disconnected"

      if (integration && integration.status === "connected") {
        if (expiresAt && expiresAt < now) {
          status = "expired"
        } else {
          // Check if expiring within 30 minutes
          const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000)
          if (expiresAt && expiresAt < thirtyMinutesFromNow) {
            status = "expiring"
          } else {
            status = "connected"
          }
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
  
  const IntegrationGrid = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
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
          return <CardComponent key={p.id} provider={p} integration={p.integration || null} status={p.status as any} />
        })
      )}
    </div>
  )

  const StatusSidebar = () => (
    <aside className="w-full lg:w-80 lg:pl-8 mt-8 lg:mt-0">
      <Card className="sticky top-24 shadow-sm rounded-lg border-gray-200">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">Integration Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            <li className="flex justify-between items-center">
              <span className="flex items-center text-gray-700">
                <Check className="w-4 h-4 mr-2 text-green-500" />
                <span className="font-medium">Connected</span>
              </span>
              <Badge variant="secondary" className="font-mono bg-green-50 text-green-700">
                {connected}
              </Badge>
            </li>
            <li className="flex justify-between items-center">
              <span className="flex items-center text-gray-700">
                <Bell className="w-4 h-4 mr-2 text-yellow-500" />
                <span className="font-medium">Expiring</span>
              </span>
              <Badge variant="secondary" className="font-mono bg-yellow-50 text-yellow-700">
                {expiring}
              </Badge>
            </li>
            <li className="flex justify-between items-center">
              <span className="flex items-center text-gray-700">
                <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
                <span className="font-medium">Expired</span>
              </span>
              <Badge variant="secondary" className="font-mono bg-red-50 text-red-700">
                {expired}
              </Badge>
            </li>
            <li className="flex justify-between items-center">
              <span className="flex items-center text-gray-700">
                <X className="w-4 h-4 mr-2 text-gray-400" />
                <span className="font-medium">Disconnected</span>
              </span>
              <Badge variant="secondary" className="font-mono bg-gray-50 text-gray-700">
                {disconnected}
              </Badge>
            </li>
          </ul>
          <div className="border-t my-6" />
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-refresh" className="text-sm font-medium text-gray-700">
              Auto-refresh tokens
            </Label>
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
        </CardContent>
      </Card>
    </aside>
  )

  return (
    <AppLayout title="Integrations">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Integrations</h1>
            <p className="text-gray-600 mt-1">Manage your connections to third-party services.</p>
          </div>
          <Button 
            onClick={handleRefreshTokens} 
            disabled={loading} 
            variant="outline"
            className="w-full sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh All
              </>
            )}
          </Button>
        </div>

        <div className="lg:flex lg:gap-8">
          <main className="flex-1">
            <div className="space-y-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="Search integrations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full h-11"
                />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:flex sm:flex-row gap-2">
                  <TabsTrigger value="all" className="flex-1 sm:flex-none">All</TabsTrigger>
                  <TabsTrigger value="connected" className="flex-1 sm:flex-none">Connected</TabsTrigger>
                  <TabsTrigger value="expiring" className="flex-1 sm:flex-none">Expiring Soon</TabsTrigger>
                  <TabsTrigger value="expired" className="flex-1 sm:flex-none">Expired</TabsTrigger>
                  <TabsTrigger value="disconnected" className="flex-1 sm:flex-none">Disconnected</TabsTrigger>
                </TabsList>
              </Tabs>

              <IntegrationGrid />
            </div>
          </main>
          <StatusSidebar />
        </div>
      </div>
    </AppLayout>
  )
}

export default IntegrationsContent
