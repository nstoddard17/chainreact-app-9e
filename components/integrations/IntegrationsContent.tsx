"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import AppLayout from "@/components/layout/AppLayout"
import { IntegrationCard } from "./IntegrationCard"
import { ApiKeyIntegrationCard } from "./ApiKeyIntegrationCard"
import { Loader2, RefreshCw, Bell, Check, X, Search } from "lucide-react"
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
    await new Promise((res) => setTimeout(res, 1000))
    await fetchIntegrations(true)
    toast({ title: "Success", description: "All tokens have been refreshed." })
  }, [fetchIntegrations, toast])

  const providersWithStatus = useMemo(() => {
    if (!providers || providers.length === 0) return []

    return providers.map((provider) => {
      const integration = integrations.find((i) => i.provider === provider.id)
      const now = new Date()
      const expiresAt = integration?.expires_at ? new Date(integration.expires_at) : null
      let status = "disconnected"

      if (integration && integration.status === "connected") {
        if (expiresAt && expiresAt < now) {
          status = "expiring"
        } else {
          const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)
          if (expiresAt && expiresAt < fiveMinutesFromNow) {
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

  const { connectedCount, expiringCount, disconnectedCount } = useMemo(() => {
    const counts = providersWithStatus.reduce(
      (acc, p) => {
        if (p.status === "connected") acc.connected++
        else if (p.status === "expiring") acc.expiring++
        else acc.disconnected++
        return acc
      },
      { connected: 0, expiring: 0, disconnected: 0 }
    )
    return {
      connectedCount: counts.connected,
      expiringCount: counts.expiring,
      disconnectedCount: counts.disconnected,
    }
  }, [providersWithStatus])

  const filteredProviders = useMemo(() => {
    let filtered = providersWithStatus

    // Apply tab filtering
    if (activeTab !== "all") {
      filtered = filtered.filter((p) => p.status === activeTab)
    }

    // Apply search filtering
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      )
    }

    // Sort: expiring first, then alphabetically
    return filtered.sort((a, b) => {
      // First sort by status (expiring first)
      if (a.status === "expiring" && b.status !== "expiring") return -1
      if (a.status !== "expiring" && b.status === "expiring") return 1
      
      // Then sort alphabetically by name
      return a.name.localeCompare(b.name)
    })
  }, [providersWithStatus, activeTab, searchQuery])

  if (isInitializing) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
        </div>
      </AppLayout>
    )
  }

  const PageHeader = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Integrations</h1>
          {expiringCount > 0 && (
            <p className="text-gray-500 mt-1">
              {expiringCount} {expiringCount === 1 ? "integration is" : "integrations are"} expiring soon
            </p>
          )}
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search integrations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 w-full"
        />
      </div>
    </div>
  )

  const IntegrationGrid = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
      {loading && filteredProviders.length === 0 ? (
        <p>Loading...</p>
      ) : (
        filteredProviders.map((p) => {
          const CardComponent = p.authType === "apiKey" ? ApiKeyIntegrationCard : IntegrationCard
          return <CardComponent key={p.id} provider={p} integration={p.integration || null} status={p.status} />
        })
      )}
    </div>
  )

  const StatusSidebar = () => (
    <aside className="hidden lg:block w-full lg:pl-8 mt-8 lg:mt-0">
      <Card className="shadow-sm rounded-lg border-gray-200">
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
                {connectedCount}
              </Badge>
            </li>
            <li className="flex justify-between items-center">
              <span className="flex items-center text-gray-700">
                <Bell className="w-4 h-4 mr-2 text-yellow-500" />
                Expiring
              </span>
              <Badge variant="secondary" className="font-mono">
                {expiringCount}
              </Badge>
            </li>
            <li className="flex justify-between items-center">
              <span className="flex items-center text-gray-700">
                <X className="w-4 h-4 mr-2 text-gray-400" />
                Disconnected
              </span>
              <Badge variant="secondary" className="font-mono">
                {disconnectedCount}
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
    <AppLayout>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:gap-8">
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h1 className="text-2xl font-semibold text-slate-900">Integrations</h1>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    type="text"
                    placeholder="Search integrations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshTokens}
                  disabled={loading}
                  className="whitespace-nowrap"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>

            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
                <CardContent className="p-0">
                  <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0 overflow-x-auto">
                    <TabsTrigger
                      value="all"
                      className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none whitespace-nowrap"
                    >
                      All
                    </TabsTrigger>
                    <TabsTrigger
                      value="connected"
                      className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none whitespace-nowrap"
                    >
                      Connected
                    </TabsTrigger>
                    <TabsTrigger
                      value="disconnected"
                      className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none whitespace-nowrap"
                    >
                      Disconnected
                    </TabsTrigger>
                  </TabsList>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProviders.map((integration) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    onRefresh={handleRefreshTokens}
                    onDisconnect={handleRefreshTokens}
                    onReconnect={handleRefreshTokens}
                    onDelete={handleRefreshTokens}
                  />
                ))}
              </div>
            </Tabs>
          </div>
          <StatusSidebar />
        </div>
      </div>
    </AppLayout>
  )
}

export default IntegrationsContent
