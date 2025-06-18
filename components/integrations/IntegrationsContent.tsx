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
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
        </div>
      </AppLayout>
    )
  }
  
  const IntegrationGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {loading && filteredProviders.length === 0 ? (
        <p>Loading integrations...</p>
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
        <CardHeader>
          <CardTitle className="text-lg">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between items-center">
              <span className="flex items-center text-gray-700">
                <Check className="w-4 h-4 mr-2 text-green-500" />
                Connected
              </span>
              <Badge variant="secondary" className="font-mono">
                {connected}
              </Badge>
            </li>
            <li className="flex justify-between items-center">
              <span className="flex items-center text-gray-700">
                <Bell className="w-4 h-4 mr-2 text-yellow-500" />
                Expiring
              </span>
              <Badge variant="secondary" className="font-mono">
                {expiring}
              </Badge>
            </li>
            <li className="flex justify-between items-center">
              <span className="flex items-center text-gray-700">
                <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
                Expired
              </span>
              <Badge variant="secondary" className="font-mono">
                {expired}
              </Badge>
            </li>
            <li className="flex justify-between items-center">
              <span className="flex items-center text-gray-700">
                <X className="w-4 h-4 mr-2 text-gray-400" />
                Disconnected
              </span>
              <Badge variant="secondary" className="font-mono">
                {disconnected}
              </Badge>
            </li>
          </ul>
          <div className="border-t my-4" />
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-refresh" className="text-sm text-gray-700">
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
        <div className="flex justify-between items-start mb-6">
           <div>
             <h1 className="text-3xl font-bold text-gray-800">Integrations</h1>
             <p className="text-gray-500 mt-1">Manage your connections to third-party services.</p>
           </div>
           <Button onClick={handleRefreshTokens} disabled={loading} variant="outline">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
             Refresh All
           </Button>
        </div>

        <div className="lg:flex lg:gap-8">
          <main className="flex-1">
             <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="Search integrations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="connected">Connected</TabsTrigger>
                <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
                <TabsTrigger value="expired">Expired</TabsTrigger>
                <TabsTrigger value="disconnected">Disconnected</TabsTrigger>
              </TabsList>
            </Tabs>
            <IntegrationGrid />
          </main>
          <StatusSidebar />
        </div>
      </div>
    </AppLayout>
  )
}

export default IntegrationsContent
