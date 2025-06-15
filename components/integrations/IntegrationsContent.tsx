"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import ScopeValidationAlert from "./ScopeValidationAlert"
import AppLayout from "@/components/layout/AppLayout"
import IntegrationCard from "./IntegrationCard"
import IntegrationDiagnostics from "./IntegrationDiagnostics"
import { Loader2, CheckCircle, Stethoscope, RefreshCw, AlertCircle, Bug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

function IntegrationsContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [localLoading, setLocalLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [oauthProcessed, setOauthProcessed] = useState(false)
  const [tokenRefreshing, setTokenRefreshing] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const router = useRouter()

  const {
    integrations = [],
    providers = [],
    loading: isLoading,
    error,
    debugInfo,
    initializeProviders,
    fetchIntegrations,
    refreshAllTokens,
    clearError,
    getConnectedProviders,
    getIntegrationStatus,
    getIntegrationByProvider,
  } = useIntegrationStore()

  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { user } = useAuthStore()

  // Initialize providers on mount
  useEffect(() => {
    console.log("🚀 Initializing providers...")
    initializeProviders()
  }, [initializeProviders])

  // Memoized data loading function
  const loadData = useCallback(async () => {
    try {
      setLocalLoading(true)
      setLoadError(null)
      console.log("📊 Loading integrations data...")

      const timeoutId = setTimeout(() => {
        setLoadError("Loading integrations timed out. Please refresh the page.")
        setLocalLoading(false)
      }, 15000)

      await fetchIntegrations(true)
      clearTimeout(timeoutId)
      console.log("✅ Data loading completed")
    } catch (err: any) {
      console.error("❌ Failed to load integrations:", err)
      setLoadError(err.message || "Failed to load integrations. Please try again.")
    } finally {
      setLocalLoading(false)
    }
  }, [fetchIntegrations])

  // Handle initial data loading
  useEffect(() => {
    if (user && providers.length > 0) {
      console.log("👤 User authenticated, loading data...", { userId: user.id, providerCount: providers.length })
      loadData()
    }
  }, [user, providers.length, loadData])

  // Enhanced OAuth callback handling
  useEffect(() => {
    if (oauthProcessed) return

    const success = searchParams.get("success")
    const error = searchParams.get("error")
    const provider = searchParams.get("provider")
    const message = searchParams.get("message")

    if ((success || error) && provider) {
      setOauthProcessed(true)
      console.log("🔄 Processing OAuth callback:", { success, error, provider, message })

      if (success === "true") {
        const refreshIntegrationsList = async () => {
          try {
            console.log("🔄 Refreshing integrations after OAuth success...")
            await fetchIntegrations(true)

            setTimeout(() => fetchIntegrations(true), 1000)
            setTimeout(() => fetchIntegrations(true), 2000)
            setTimeout(() => fetchIntegrations(true), 3000)

            toast({
              title: "Integration Connected",
              description: `Your ${provider} integration has been successfully connected!`,
              duration: 5000,
            })
          } catch (err) {
            console.error("Failed to refresh integrations after OAuth:", err)
          }
        }

        refreshIntegrationsList()
      } else if (error) {
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

  // Enhanced token refresh
  const handleRefreshTokens = useCallback(async () => {
    try {
      setTokenRefreshing(true)

      const data = await refreshAllTokens()

      toast({
        title: "Tokens Refreshed",
        description: `${data.stats?.successful || 0} refreshed, ${data.stats?.skipped || 0} already valid, ${data.stats?.failed || 0} failed`,
        duration: 5000,
      })
    } catch (err: any) {
      console.error("Failed to refresh tokens:", err)
      toast({
        title: "Refresh Failed",
        description: err.message || "Could not refresh integration tokens. Please try again.",
        variant: "destructive",
        duration: 7000,
      })
    } finally {
      setTokenRefreshing(false)
    }
  }, [refreshAllTokens, toast])

  // Merge providers with integration status
  const providersWithStatus = providers.map((provider) => {
    const integration = getIntegrationByProvider(provider.id)
    const status = getIntegrationStatus(provider.id)

    return {
      ...provider,
      connected: status === "connected",
      wasConnected: integration && status === "disconnected",
      integration,
      status,
      isConnected: status === "connected",
      isAvailable: provider.isAvailable,
    }
  })

  const connectedCount = integrations.filter((i) => i.status === "connected").length
  const connectedProviders = getConnectedProviders()

  console.log("🔍 Current state:", {
    integrations: integrations.length,
    providers: providers.length,
    connectedCount,
    connectedProviders,
    debugInfo,
  })

  // Show loading state
  if (localLoading || (isLoading && integrations.length === 0)) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
          <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-slate-600 font-medium">Loading integrations...</p>
              <p className="text-sm text-slate-500">Detecting available integrations and fetching connection status</p>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-4 py-8">
          <ScopeValidationAlert />

          {(loadError || error) && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {loadError || error}
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="bg-white" onClick={loadData}>
                    Retry
                  </Button>
                  {error && (
                    <Button variant="ghost" size="sm" onClick={clearError}>
                      Dismiss
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-8">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="space-y-2">
                <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Integrations</h1>
                <p className="text-lg text-slate-600">
                  Connect your favorite tools and services to automate your workflows
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant="secondary"
                  className="text-sm font-medium bg-green-100 text-green-800 border-green-200 px-3 py-1"
                >
                  <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                  {connectedCount} Connected
                </Badge>
                <Button
                  onClick={handleRefreshTokens}
                  variant="default"
                  size="sm"
                  disabled={isLoading || tokenRefreshing}
                  className="bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  {tokenRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span className="ml-2 hidden sm:inline">{tokenRefreshing ? "Refreshing..." : "Refresh Tokens"}</span>
                </Button>
                {process.env.NODE_ENV === "development" && (
                  <Button
                    onClick={() => setShowDebug(!showDebug)}
                    variant="outline"
                    size="sm"
                    className="border-slate-300"
                  >
                    <Bug className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Debug Panel */}
            {showDebug && process.env.NODE_ENV === "development" && (
              <Alert className="bg-slate-50 border-slate-200">
                <Bug className="h-4 w-4" />
                <AlertTitle>Debug Information</AlertTitle>
                <AlertDescription>
                  <pre className="text-xs mt-2 overflow-auto">
                    {JSON.stringify(
                      {
                        integrations: integrations.map((i) => ({
                          id: i.id,
                          provider: i.provider,
                          status: i.status,
                          created_at: i.created_at,
                        })),
                        connectedProviders,
                        debugInfo,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </AlertDescription>
              </Alert>
            )}

            {/* Tabs */}
            <Tabs defaultValue="integrations" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-white border border-slate-200 p-1 rounded-lg shadow-sm">
                <TabsTrigger
                  value="integrations"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm font-medium transition-all"
                >
                  Integrations
                </TabsTrigger>
                <TabsTrigger
                  value="diagnostics"
                  className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm font-medium transition-all"
                >
                  <Stethoscope className="h-4 w-4" />
                  Diagnostics
                </TabsTrigger>
              </TabsList>

              <TabsContent value="integrations" className="space-y-8 mt-8">
                <div className="space-y-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold text-slate-900">All Integrations</h2>
                      <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-medium">
                        {providersWithStatus.length} integrations
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {providersWithStatus
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((provider) => (
                          <IntegrationCard key={provider.id} provider={provider} />
                        ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="diagnostics" className="mt-8">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                  <IntegrationDiagnostics />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

export default IntegrationsContent
