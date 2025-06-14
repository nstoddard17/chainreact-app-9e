"use client"

import { useState, useEffect } from "react"
import ScopeValidationAlert from "./ScopeValidationAlert"
import AppLayout from "@/components/layout/AppLayout"
import { useIntegrationStore } from "@/stores/integrationStore"
import IntegrationCard from "./IntegrationCard"
import IntegrationDiagnostics from "./IntegrationDiagnostics"
import { Input } from "@/components/ui/input"
import { Search, Loader2, Filter, CheckCircle, Stethoscope, RefreshCw, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSearchParams, useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/stores/authStore"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function IntegrationsContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [oauthProcessed, setOauthProcessed] = useState(false)
  const [tokenRefreshing, setTokenRefreshing] = useState(false)
  const router = useRouter()

  const { integrations, providers, loading, refreshing, error, fetchIntegrations, refreshTokens } =
    useIntegrationStore()

  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { getCurrentUserId } = useAuthStore()

  // Handle initial data loading with timeout
  useEffect(() => {
    const loadData = async () => {
      try {
        setLocalLoading(true)
        setLoadError(null)

        // Set a timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
          setLoadError("Loading integrations timed out. Please refresh the page.")
          setLocalLoading(false)
        }, 15000) // 15 second timeout

        await fetchIntegrations(true)

        // Clear the timeout if successful
        clearTimeout(timeoutId)
      } catch (err: any) {
        console.error("Failed to load integrations:", err)
        setLoadError(err.message || "Failed to load integrations. Please try again.")
      } finally {
        setLocalLoading(false)
      }
    }

    loadData()
  }, [fetchIntegrations])

  // Handle OAuth callback messages
  useEffect(() => {
    if (oauthProcessed) return

    const success = searchParams.get("success")
    const error = searchParams.get("error")
    const provider = searchParams.get("provider")
    const message = searchParams.get("message")
    const timestamp = searchParams.get("t")

    if ((success || error) && provider) {
      console.log("OAuth callback detected:", { success, error, provider, message, timestamp })
      setOauthProcessed(true)

      if (success === "true") {
        // Enhanced success handling with multiple refresh attempts
        const refreshIntegrationsList = async () => {
          try {
            console.log(`Refreshing integrations after ${provider} OAuth success`)

            // Multiple refresh attempts to ensure we get the latest data
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                await fetchIntegrations(true)
                console.log(`Refresh attempt ${attempt} completed`)

                // Check if the integration is now connected
                const integrations = useIntegrationStore.getState().integrations
                const connectedIntegration = integrations.find(
                  (i) => i.provider === provider && i.status === "connected",
                )

                if (connectedIntegration) {
                  toast({
                    title: "Integration Connected Successfully",
                    description: `Your ${provider} integration is now active and ready to use!`,
                    duration: 6000,
                  })
                  break
                }

                // Wait before next attempt
                if (attempt < 3) {
                  await new Promise((resolve) => setTimeout(resolve, 2000))
                }
              } catch (err) {
                console.error(`Error in refresh attempt ${attempt}:`, err)
                if (attempt === 3) {
                  throw err
                }
              }
            }
          } catch (err) {
            console.error("Failed to refresh integrations after OAuth:", err)
            toast({
              title: "Connection Completed",
              description: `${provider} connection completed. If you don't see it connected, please refresh the page.`,
              duration: 8000,
            })
          }
        }

        refreshIntegrationsList()
      } else if (error) {
        const errorMsg = message ? decodeURIComponent(message) : "Failed to connect integration"
        console.error("OAuth error:", { error, provider, message: errorMsg })

        let userFriendlyMessage = errorMsg

        if (errorMsg.includes("access_denied")) {
          userFriendlyMessage = `Authorization was cancelled. Please try connecting ${provider} again.`
        } else if (errorMsg.includes("invalid_request")) {
          userFriendlyMessage = `Invalid request. Please try connecting ${provider} again.`
        } else if (errorMsg.includes("server_error")) {
          userFriendlyMessage = `Server error occurred. Please try connecting ${provider} again later.`
        } else if (errorMsg.includes("temporarily_unavailable")) {
          userFriendlyMessage = `${provider} is temporarily unavailable. Please try again later.`
        }

        toast({
          title: "Connection Failed",
          description: userFriendlyMessage,
          variant: "destructive",
          duration: 10000,
        })
      }

      // Clean up URL parameters after processing
      setTimeout(() => {
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href)
          url.searchParams.delete("success")
          url.searchParams.delete("error")
          url.searchParams.delete("provider")
          url.searchParams.delete("message")
          url.searchParams.delete("t")
          window.history.replaceState({}, "", url.toString())
        }
      }, 2000)
    }
  }, [searchParams, toast, fetchIntegrations, router, oauthProcessed])

  // Get unique categories from providers
  const categories = Array.from(new Set(providers.map((p) => p.category)))

  // Filter providers based on search and category
  const filteredProviders = providers.filter((provider) => {
    const matchesSearch =
      provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.capabilities.some((cap) => cap.toLowerCase().includes(searchTerm.toLowerCase()))

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

  const handleRefresh = async () => {
    try {
      console.log("Manual refresh triggered")
      setLocalLoading(true)
      setLoadError(null)

      await fetchIntegrations(true)

      toast({
        title: "Refreshed Successfully",
        description: "Integration data has been updated.",
        duration: 3000,
      })
    } catch (err: any) {
      console.error("Refresh failed:", err)
      setLoadError("Failed to refresh integration data. Please try again.")

      toast({
        title: "Refresh Failed",
        description: "Could not refresh integration data. Please check your connection and try again.",
        variant: "destructive",
        duration: 6000,
      })
    } finally {
      setLocalLoading(false)
    }
  }

  const handleRefreshTokens = async () => {
    try {
      setTokenRefreshing(true)

      const userId = getCurrentUserId()
      if (!userId) {
        throw new Error("User not authenticated")
      }

      // Set a timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out")), 30000)
      })

      const fetchPromise = fetch("/api/integrations/refresh-all-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      })

      // Race between the fetch and the timeout
      const response = (await Promise.race([fetchPromise, timeoutPromise])) as Response
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to refresh tokens")
      }

      // Show success message with details
      const { stats } = data
      let message = `Token refresh completed: ${stats.successful} refreshed`

      if (stats.skipped > 0) {
        message += `, ${stats.skipped} already valid`
      }

      if (stats.failed > 0) {
        message += `, ${stats.failed} failed`
      }

      toast({
        title: "Tokens Refreshed",
        description: message,
        duration: 6000,
      })

      // If any tokens were refreshed, update the UI
      if (stats.successful > 0 || stats.failed > 0) {
        await fetchIntegrations(true)
      }
    } catch (err: any) {
      console.error("Failed to refresh tokens:", err)

      let errorMessage = "Could not refresh integration tokens. Please try again."

      if (err.message?.includes("timeout")) {
        errorMessage = "Token refresh timed out. Please try again later."
      } else if (err.message?.includes("authentication")) {
        errorMessage = "Authentication error. Please log in again."
      } else if (err.message?.includes("network")) {
        errorMessage = "Network error. Please check your connection and try again."
      }

      toast({
        title: "Refresh Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 8000,
      })
    } finally {
      setTokenRefreshing(false)
    }
  }

  // Show loading state
  if (localLoading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
          <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-slate-600 font-medium">Loading integrations...</p>
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

          {loadError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {loadError}
                <Button variant="outline" size="sm" className="ml-4 bg-white" onClick={() => window.location.reload()}>
                  Refresh Page
                </Button>
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
                  disabled={loading || refreshing || tokenRefreshing}
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
                      {categories.map((category) => (
                        <Button
                          key={category}
                          variant={selectedCategory === category ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedCategory(category)}
                          className={`h-11 px-4 font-medium transition-all ${
                            selectedCategory === category
                              ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                          }`}
                        >
                          {category}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Integrations by Category */}
                {selectedCategory ? (
                  <div className="space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-slate-900">{selectedCategory}</h2>
                        <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-medium">
                          {groupedProviders[selectedCategory]?.length || 0} integrations
                        </Badge>
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
                    {categories.map((category) => (
                      <div key={category} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-2xl font-bold text-slate-900">{category}</h2>
                          <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-medium">
                            {groupedProviders[category]?.length || 0} integrations
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {groupedProviders[category]?.map((provider) => (
                            <IntegrationCard key={provider.id} provider={provider} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* No Results State */}
                {filteredProviders.length === 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-12 shadow-sm text-center">
                    <div className="text-slate-400 text-xl font-medium mb-2">No integrations found</div>
                    <p className="text-slate-500">Try adjusting your search or filter criteria</p>
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
