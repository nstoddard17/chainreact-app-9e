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
  const { integrations, apiKeyIntegrations, refreshTokens, disconnectIntegration, reconnectIntegration, deleteIntegration } = useIntegrationStore()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const handleRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true)
      await refreshTokens()
      toast({
        title: "Success",
        description: "Integration tokens refreshed successfully.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh integration tokens.",
        variant: "destructive",
      })
    } finally {
      setIsRefreshing(false)
    }
  }, [refreshTokens, toast])

  const handleDisconnect = useCallback(async (integrationId: string) => {
    try {
      await disconnectIntegration(integrationId)
      toast({
        title: "Success",
        description: "Integration disconnected successfully.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to disconnect integration.",
        variant: "destructive",
      })
    }
  }, [disconnectIntegration, toast])

  const handleReconnect = useCallback(async (integrationId: string) => {
    try {
      await reconnectIntegration(integrationId)
      toast({
        title: "Success",
        description: "Integration reconnected successfully.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reconnect integration.",
        variant: "destructive",
      })
    }
  }, [reconnectIntegration, toast])

  const handleDelete = useCallback(async (integrationId: string) => {
    try {
      await deleteIntegration(integrationId)
      toast({
        title: "Success",
        description: "Integration deleted successfully.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete integration.",
        variant: "destructive",
      })
    }
  }, [deleteIntegration, toast])

  const filteredIntegrations = useMemo(() => {
    return integrations.filter((integration) => {
      const matchesSearch = integration.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesTab = activeTab === "all" || integration.status === activeTab
      return matchesSearch && matchesTab
    })
  }, [integrations, searchQuery, activeTab])

  const filteredApiKeyIntegrations = useMemo(() => {
    return apiKeyIntegrations.filter((integration) => {
      const matchesSearch = integration.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesTab = activeTab === "all" || integration.status === activeTab
      return matchesSearch && matchesTab
    })
  }, [apiKeyIntegrations, searchQuery, activeTab])

  const connectedCount = useMemo(() => {
    return integrations.filter((i) => i.status === "connected").length
  }, [integrations])

  const expiringCount = useMemo(() => {
    return integrations.filter((i) => i.status === "expiring").length
  }, [integrations])

  const disconnectedCount = useMemo(() => {
    return integrations.filter((i) => i.status === "disconnected").length
  }, [integrations])

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
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="whitespace-nowrap"
                >
                  {isRefreshing ? (
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
                {filteredIntegrations.map((integration) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    onRefresh={handleRefresh}
                    onDisconnect={handleDisconnect}
                    onReconnect={handleReconnect}
                    onDelete={handleDelete}
                  />
                ))}
                {filteredApiKeyIntegrations.map((integration) => (
                  <ApiKeyIntegrationCard
                    key={integration.id}
                    integration={integration}
                    onRefresh={handleRefresh}
                    onDisconnect={handleDisconnect}
                    onReconnect={handleReconnect}
                    onDelete={handleDelete}
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
