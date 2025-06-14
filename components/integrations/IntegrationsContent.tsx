"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import { getIntegrationStats } from "@/lib/integrations/availableIntegrations"
import ScopeValidationAlert from "./ScopeValidationAlert"
import AppLayout from "@/components/layout/AppLayout"
import IntegrationCard from "./IntegrationCard"
import IntegrationDiagnostics from "./IntegrationDiagnostics"
import { Input } from "@/components/ui/input"
import { Search, Loader2, Filter, CheckCircle, Stethoscope, RefreshCw, AlertCircle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function IntegrationsContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [oauthProcessed, setOauthProcessed] = useState(false)
  const [tokenRefreshing, setTokenRefreshing] = useState(false)
  const router = useRouter()

  const {
    integrations = [],
    providers = [],
    isLoading,
    error,
    initializeProviders,
    fetchIntegrations,
    refreshAllTokens,
    clearError,
  } = useIntegrationStore()

  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { user, getCurrentUserId } = useAuthStore()

  // Initialize providers on mount
  useEffect(() => {
    initializeProviders()
  }, [initializeProviders])

  // Memoized data loading function
  const loadData = useCallback(async () => {
    try {
      setLocalLoading(true)
      setLoadError(null)

      // Set a timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        setLoadError("Loading integrations timed out. Please refresh the page.")
        setLocalLoading(false)
      }, 15000)

      await fetchIntegrations()
      clearTimeout(timeoutId)
    } catch (err: any) {
      console.error("Failed to load integrations:", err)
      setLoadError(err.message || "Failed to load integrations. Please try again.")
    } finally {
      setLocalLoading(false)
    }
  }, [fetchIntegrations])

  // Handle initial data loading
  useEffect(() => {
    if (user && providers.length > 0) {
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

      if (success === "true") {
        const refreshIntegrationsList = async () => {
          try {
            // Multiple refresh attempts to ensure data consistency
            await fetchIntegrations(true)

            // Schedule additional refreshes
            setTimeout(() => fetchIntegrations(true), 1500)
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
        const errorMsg = message || "Failed to connect integration"
        toast({
          title: "Connection Failed",
          description: decodeURIComponent(errorMsg),
          variant: "destructive",
          duration: 7000,
        })
      }

      // Clean up URL parameters
      setTimeout(() => {
        router.replace("/integrations")
      }, 1000)
    }
  }, [searchParams, toast, fetchIntegrations, router, oauthProcessed])

  // Enhanced token refresh with better error handling
  const handleRefreshTokens = useCallback(async () => {
    try {
      setTokenRefreshing(true)

      const userId = getCurrentUserId()
      if (!userId) {
        throw new Error("User not authenticated")
      }

      const response = await Promise.race([
        fetch("/api/integrations/refresh-all-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Request timed out")), 10000)),
      ])

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to refresh tokens")
      }

      toast({
        title: "Tokens Refreshed",
        description: `${data.stats.successful} refreshed, ${data.stats.skipped} already valid, ${data.stats.failed} failed`,
        duration: 5000,
      })

      if (data.stats.successful > 0) {
        await fetchIntegrations(true)
      }
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
  }, [getCurrentUserId, fetchIntegrations, toast])

  // Get unique categories from providers
  const categories = Array.from(new Set(providers.map((p) => p.category)))

  // Enhanced filtering logic
  const filteredProviders = providers.filter((provider) => {
    const matchesSearch =
      provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (provider.capabilities || []).some((cap) => cap.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesCategory = !selectedCategory || provider.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  // Merge providers with integration status
  const providersWithStatus = filteredProviders.map((provider) => {
    const connectedIntegration = integrations.find((i) => i.provider === provider.id && i.status === "connected")
    const disconnectedIntegration = integrations.find((i) => i.provider === provider.id && i.status === "disconnected")

    return {
      ...provider,
      connected: !!connectedIntegration,
      wasConnected: !!disconnectedIntegration,
      integration: connectedIntegration || disconnectedIntegration || null,
    }
  })

  // Group providers by category
  const groupedProviders = categories.reduce(
    (acc, category) => {
      acc[category] = providersWithStatus.filter((p) => p.category === category)
      return acc
    },
    {} as Record<string, typeof providersWithStatus>,
  )

  const connectedCount = integrations.filter((i) => i.status === "connected").length
  const stats = getIntegrationStats()

  // Show loading state
  if (localLoading || (isLoading && integrations.length === 0)) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
          <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-slate-600 font-medium">Loading integrations...</p>
              <p className="text-sm text-slate-500">Detecting available integrations from environment variables</p>
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

          {/* Integration Statistics Alert */}
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-900">Integration Status</AlertTitle>
            <AlertDescription className="text-blue-800">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <div>
                  <span className="font-semibold">{stats.available}</span> of{" "}
                  <span className="font-semibold">{stats.total}</span> integrations available
                </div>
                <div>
                  <span className="font-semibold">{connectedCount}</span> currently connected
                </div>
                <div>
                  <span className="font-semibold">{stats.categories}</span> categories
                </div>
                <div>
                  <span className="font-semibold">{stats.unavailable}</span> need configuration
                </div>
              </div>
            </AlertDescription>
          </Alert>

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
                <p className="text-sm text-slate-500">
                  {stats.available} of {stats.total} integrations are configured and ready to use
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
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="integrations" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-white border border-slate-200 p-1 rounded-lg shadow-sm">
                <TabsTrigger
                  value="integrations"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm font-medium transition-all"
                >
                  Integrations ({stats.available} Available)
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
                {/* Search and Filters */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <Input
                        placeholder="Search integrations..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-11 h-11 bg-slate-50 border-slate-200 focus:border-blue-500 focus:ring-blue-500 text-slate-900 placeholder:text-slate-500"
                      />
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant={selectedCategory === null ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedCategory(null)}
                        className={`flex items-center gap-2 h-11 px-4 font-medium transition-all ${
                          selectedCategory === null
                            ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                        }`}
                      >
                        <Filter className="w-4 h-4" />
                        All Categories
                      </Button>
                      {categories.map((category) => {
                        const categoryStats = stats.byCategory[category]
                        return (
                          <Button
                            key={category}
                            variant={selectedCategory === category ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedCategory(category)}
                            className={`h-11 px-4 font-medium transition-all capitalize ${
                              selectedCategory === category
                                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                            }`}
                          >
                            {category} ({categoryStats?.available || 0})
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Integrations by Category */}
                {selectedCategory ? (
                  <div className="space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-slate-900 capitalize">{selectedCategory}</h2>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-medium">
                            {groupedProviders[selectedCategory]?.filter((p) => p.isAvailable).length || 0} available
                          </Badge>
                          <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-medium">
                            {groupedProviders[selectedCategory]?.length || 0} total
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {groupedProviders[selectedCategory]?.map((provider) => (
                          <IntegrationCard key={provider.id} provider={provider} />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {categories.map((category) => {
                      const categoryProviders = groupedProviders[category] || []
                      const availableCount = categoryProviders.filter((p) => p.isAvailable).length

                      return (
                        <div key={category} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                          <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-slate-900 capitalize">{category}</h2>
                            <div className="flex gap-2">
                              <Badge
                                variant="outline"
                                className="bg-green-50 text-green-700 border-green-200 font-medium"
                              >
                                {availableCount} available
                              </Badge>
                              <Badge
                                variant="outline"
                                className="bg-slate-50 text-slate-700 border-slate-200 font-medium"
                              >
                                {categoryProviders.length} total
                              </Badge>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {categoryProviders.map((provider) => (
                              <IntegrationCard key={provider.id} provider={provider} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* No Results State */}
                {filteredProviders.length === 0 && !isLoading && (
                  <div className="bg-white rounded-xl border border-slate-200 p-12 shadow-sm text-center">
                    <div className="text-slate-400 text-xl font-medium mb-2">No integrations found</div>
                    <p className="text-slate-500 mb-4">Try adjusting your search or filter criteria</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchTerm("")
                        setSelectedCategory(null)
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                )}
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
