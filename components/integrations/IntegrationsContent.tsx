"use client"

import { useState, useEffect } from "react"
import ScopeValidationAlert from "./ScopeValidationAlert"
import AppLayout from "@/components/layout/AppLayout"
import { useIntegrationStore } from "@/stores/integrationStore"
import IntegrationCard from "./IntegrationCard"
import IntegrationDiagnostics from "./IntegrationDiagnostics"
import { Input } from "@/components/ui/input"
import { Search, Loader2, Filter, CheckCircle, Stethoscope, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSearchParams, useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

export default function IntegrationsContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [oauthProcessed, setOauthProcessed] = useState(false)
  const [bulkReconnecting, setBulkReconnecting] = useState(false)
  const router = useRouter()

  const { integrations, providers, loading, refreshing, error, fetchIntegrations, refreshTokens } =
    useIntegrationStore()

  const searchParams = useSearchParams()
  const { toast } = useToast()

  // Handle initial data loading
  useEffect(() => {
    const loadData = async () => {
      try {
        setLocalLoading(true)
        await fetchIntegrations(true)
      } catch (err: any) {
        console.error("Failed to load integrations:", err)
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

      if (success && !error) {
        // Force refresh integrations with multiple attempts to ensure we get the latest data
        const refreshIntegrationsList = async () => {
          try {
            console.log(`Refreshing integrations after ${provider} OAuth success`)

            // First immediate refresh
            await fetchIntegrations(true)

            // Schedule additional refreshes to ensure we get the latest data
            setTimeout(async () => {
              try {
                await fetchIntegrations(true)
                console.log("Second refresh completed")
              } catch (err) {
                console.error("Error in second refresh:", err)
              }
            }, 1500)

            setTimeout(async () => {
              try {
                await fetchIntegrations(true)
                console.log("Third refresh completed")
              } catch (err) {
                console.error("Error in third refresh:", err)
              }
            }, 3000)

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
        console.error("OAuth error:", { error, provider, message: errorMsg })

        toast({
          title: "Connection Failed",
          description: decodeURIComponent(errorMsg),
          variant: "destructive",
          duration: 7000,
        })
      }

      // Clean up URL parameters after a delay
      setTimeout(() => {
        if (typeof window !== "undefined") {
          router.replace("/integrations")
        }
      }, 1000)
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
      await fetchIntegrations(true)

      toast({
        title: "Refreshed",
        description: "Integration data has been refreshed.",
      })
    } catch (err: any) {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh integration data. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleBulkReconnect = async () => {
    try {
      setBulkReconnecting(true)

      // Get current user (you'll need to implement this based on your auth system)
      const userId = "current-user-id" // Replace with actual user ID from your auth context

      const response = await fetch("/api/integrations/bulk-reconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate reconnection URLs")
      }

      if (data.reconnectionUrls.length === 0) {
        toast({
          title: "No Integrations",
          description: "No connected integrations found to reconnect.",
        })
        return
      }

      // Process silent reconnections first
      const silentUrls = data.reconnectionUrls.filter((item: any) => item.silent)
      const interactiveUrls = data.reconnectionUrls.filter((item: any) => !item.silent)

      // Handle silent reconnections in hidden iframes
      for (const item of silentUrls) {
        try {
          // Create hidden iframe for silent auth
          const iframe = document.createElement("iframe")
          iframe.style.display = "none"
          iframe.src = item.url
          document.body.appendChild(iframe)

          // Remove iframe after a delay
          setTimeout(() => {
            document.body.removeChild(iframe)
          }, 5000)
        } catch (error) {
          console.error(`Silent reconnection failed for ${item.provider}:`, error)
        }
      }

      // Handle interactive reconnections
      if (interactiveUrls.length > 0) {
        toast({
          title: "Reconnecting Integrations",
          description: `${silentUrls.length} integrations reconnecting silently. ${interactiveUrls.length} require user interaction.`,
          duration: 8000,
        })

        // Open interactive reconnections in sequence with delays
        for (let i = 0; i < interactiveUrls.length; i++) {
          setTimeout(() => {
            window.open(interactiveUrls[i].url, "_blank", "width=600,height=700")
          }, i * 2000) // 2 second delay between each popup
        }
      } else {
        toast({
          title: "Reconnecting Integrations",
          description: `${silentUrls.length} integrations reconnecting silently.`,
          duration: 5000,
        })
      }

      // Refresh the integrations list after a delay
      setTimeout(async () => {
        await fetchIntegrations(true)
      }, 10000)
    } catch (err: any) {
      console.error("Bulk reconnection failed:", err)
      toast({
        title: "Reconnection Failed",
        description: "Could not reconnect integrations. Please try again.",
        variant: "destructive",
      })
    } finally {
      setBulkReconnecting(false)
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
                  onClick={handleBulkReconnect}
                  variant="default"
                  size="sm"
                  disabled={loading || refreshing || bulkReconnecting || connectedCount === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  {bulkReconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span className="ml-2 hidden sm:inline">
                    {bulkReconnecting ? "Reconnecting..." : "Reconnect All"}
                  </span>
                </Button>
                <Button
                  onClick={handleRefresh}
                  variant="outline"
                  size="sm"
                  disabled={loading || refreshing}
                  className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  {loading || refreshing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span className="ml-2 hidden sm:inline">Refresh</span>
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
