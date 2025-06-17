"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import ScopeValidationAlert from "./ScopeValidationAlert"
import AppLayout from "@/components/layout/AppLayout"
import IntegrationCard from "./IntegrationCard"
import { ApiKeyIntegrationCard } from "./ApiKeyIntegrationCard"
import IntegrationDiagnostics from "./IntegrationDiagnostics"
import { Loader2, CheckCircle, Stethoscope, RefreshCw, AlertCircle, Bug, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import RedirectLoadingOverlay from "./RedirectLoadingOverlay"
import { Input } from "@/components/ui/input"

function IntegrationsContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [localLoading, setLocalLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [oauthProcessed, setOauthProcessed] = useState(false)
  const [tokenRefreshing, setTokenRefreshing] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const router = useRouter()
  const [redirectingProvider, setRedirectingProvider] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("all")

  const {
    integrations = [],
    providers = [],
    loading,
    error,
    debugInfo,
    initializeProviders,
    fetchIntegrations,
    refreshAllTokens,
    clearError,
    getConnectedProviders,
  } = useIntegrationStore()

  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { user, getCurrentUserId } = useAuthStore()

  const TABS = useMemo(
    () => [
      { value: "all", label: "All" },
      { value: "connected", label: "Connected" },
    ],
    [],
  )

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab && TABS.find((t) => t.value === tab)) {
      setActiveTab(tab)
    }
  }, [searchParams, TABS])

  useEffect(() => {
    const initializeData = async () => {
      try {
        await initializeProviders()
        if (user) {
          await fetchIntegrations(true)
        }
        setLocalLoading(false)
      } catch (error: any) {
        setLoadError(error.message || "Failed to initialize integrations")
        setLocalLoading(false)
      }
    }

    initializeData()
  }, [user, initializeProviders, fetchIntegrations])

  useEffect(() => {
    if (oauthProcessed) return

    const success = searchParams.get("success")
    const errorParam = searchParams.get("error")
    const provider = searchParams.get("provider")
    const message = searchParams.get("message")

    if ((success || errorParam) && provider) {
      setOauthProcessed(true)

      const isSuccess = success === "true" || (!!success && success.endsWith("_connected"))

      if (isSuccess) {
        fetchIntegrations(true)
        toast({
          title: "Integration Connected",
          description: `Your ${provider} integration has been successfully connected!`,
          duration: 5000,
        })
      } else if (errorParam) {
        const errorMsg = message ? decodeURIComponent(message) : "Failed to connect integration"
        toast({
          title: "Connection Failed",
          description: errorMsg,
          variant: "destructive",
          duration: 7000,
        })
      }

      setTimeout(() => {
        const cleanUrl = window.location.pathname
        window.history.replaceState({}, document.title, cleanUrl)
      }, 1000)
    }
  }, [searchParams, toast, fetchIntegrations, oauthProcessed])

  const handleRefreshTokens = useCallback(async () => {
    try {
      setTokenRefreshing(true)
      await refreshAllTokens()
      toast({
        title: "Tokens Refreshed",
        description: "Successfully attempted to refresh all active integration tokens.",
        duration: 5000,
      })
    } catch (err: any) {
      toast({
        title: "Refresh Failed",
        description: err.message || "Could not refresh integration tokens.",
        variant: "destructive",
        duration: 7000,
      })
    } finally {
      setTokenRefreshing(false)
    }
  }, [refreshAllTokens, toast])

  const providersWithStatus = useMemo(
    () =>
      providers.map((provider) => {
        const connectedIntegration = integrations.find((i) => i.provider === provider.id && i.status === "connected")
        const disconnectedIntegration = integrations.find((i) => i.provider === provider.id && i.status === "disconnected")
        const anyIntegration = integrations.find((i) => i.provider === provider.id)

        return {
          ...provider,
          connected: !!connectedIntegration,
          wasConnected: !!disconnectedIntegration,
          integration: connectedIntegration || disconnectedIntegration || anyIntegration || null,
          isAvailable: provider.isAvailable,
        }
      }),
    [providers, integrations],
  )

  const filteredProviders = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase()
    let filtered = providersWithStatus

    if (activeTab === "connected") {
      filtered = filtered.filter((p) => p.connected)
    }

    if (lowercasedFilter) {
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(lowercasedFilter))
    }

    return filtered
  }, [searchTerm, activeTab, providersWithStatus])

  if (localLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <RedirectLoadingOverlay provider={redirectingProvider ?? undefined} isVisible={!!redirectingProvider} />
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <ScopeValidationAlert />

          {(loadError || error) && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{loadError || error}</AlertDescription>
              <Button onClick={clearError} variant="outline" size="sm" className="mt-2">
                Clear
              </Button>
            </Alert>
          )}

          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Integrations</h1>
                <p className="text-gray-500 mt-1">Connect and manage your third-party services.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleRefreshTokens} variant="outline" size="sm" disabled={loading || tokenRefreshing}>
                  {tokenRefreshing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Refresh Tokens
                </Button>
                <Button onClick={() => setShowDebug(!showDebug)} variant="outline" size="sm">
                  <Stethoscope className="w-4 h-4 mr-2" />
                  Health
                </Button>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex justify-between items-center mb-4">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="connected">Connected ({providersWithStatus.filter((p) => p.connected).length})</TabsTrigger>
                {showDebug && (
                  <TabsTrigger value="debug">
                    <Bug className="w-4 h-4 mr-2" />
                    Debug
                  </TabsTrigger>
                )}
              </TabsList>
              <div className="w-full max-w-xs">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    placeholder="Search integrations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <TabsContent value="all">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredProviders.map((provider) =>
                  provider.authType === "apiKey" ? (
                    <ApiKeyIntegrationCard key={provider.id} provider={provider} integration={provider.integration} />
                  ) : (
                    <IntegrationCard
                      key={provider.id}
                      provider={provider}
                      connected={provider.connected}
                      wasConnected={provider.wasConnected}
                      integration={provider.integration}
                      isAvailable={provider.isAvailable}
                      onConnecting={() => setRedirectingProvider(provider.id)}
                    />
                  ),
                )}
              </div>
            </TabsContent>
            <TabsContent value="connected">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredProviders.map((provider) =>
                  provider.authType === "apiKey" ? (
                    <ApiKeyIntegrationCard key={provider.id} provider={provider} integration={provider.integration} />
                  ) : (
                    <IntegrationCard
                      key={provider.id}
                      provider={provider}
                      connected={provider.connected}
                      wasConnected={provider.wasConnected}
                      integration={provider.integration}
                      isAvailable={provider.isAvailable}
                      onConnecting={() => setRedirectingProvider(provider.id)}
                    />
                  ),
                )}
              </div>
            </TabsContent>
            {showDebug && (
              <TabsContent value="debug">
                <IntegrationDiagnostics />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </AppLayout>
  )
}

export default IntegrationsContent
