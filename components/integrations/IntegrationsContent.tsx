"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import AppLayout from "@/components/layout/AppLayout"
import { IntegrationCard } from "./IntegrationCard"
import { ApiKeyIntegrationCard } from "./ApiKeyIntegrationCard"
import { Loader2, RefreshCw, Bell, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

function IntegrationsContent() {
  const [activeTab, setActiveTab] = useState("all")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [isInitializing, setIsInitializing] = useState(true)
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
          const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          if (expiresAt && expiresAt < sevenDaysFromNow) {
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
    switch (activeTab) {
      case "connected":
        return providersWithStatus.filter((p) => p.status === "connected")
      case "expiring":
        return providersWithStatus.filter((p) => p.status === "expiring")
      case "disconnected":
        return providersWithStatus.filter((p) => p.status === "disconnected")
      case "all":
      default:
        return providersWithStatus
    }
  }, [activeTab, providersWithStatus])

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
    <div className="flex justify-between items-start mb-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Integrations</h1>
        {expiringCount > 0 && (
          <p className="text-gray-500 mt-1">
            {expiringCount} {expiringCount === 1 ? "integration is" : "integrations are"} expiring soon
          </p>
        )}
      </div>
    </div>
  )

  const IntegrationGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="lg:flex lg:gap-8">
          <main className="flex-1">
            <PageHeader />
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="connected">Connected</TabsTrigger>
                <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
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
