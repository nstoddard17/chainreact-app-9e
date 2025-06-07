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

    if (success || error) {
      console.log("OAuth callback detected:", { success, error, provider, message, timestamp })
      setOauthProcessed(true)
    }

    if (success === "true") {
      // Force refresh integrations with a delay to ensure database has been updated
      const refreshIntegrationsList = async () => {
        try {
          console.log(`Refreshing integrations after ${provider} OAuth success`)
          await fetchIntegrations(true)

          toast({
            title: "Integration Connected",
            description: `Your ${provider || "integration"} has been successfully connected!`,
            duration: 5000,
          })
        } catch (err) {
          console.error("Failed to refresh integrations after OAuth:", err)

          // Try refreshing again after a short delay
          setTimeout(async () => {
            try {
              await fetchIntegrations(true)
            } catch (retryErr) {
              console.error("Failed to refresh integrations on retry:", retryErr)
            }
          }, 2000)
        }
      }

      // Add a delay to ensure database operations are complete
      setTimeout(refreshIntegrationsList, 1000)
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

    // Clean up URL parameters
    if ((success || error) && typeof window !== "undefined") {
      // Use setTimeout to ensure the toast has time to display
      setTimeout(() => {
        router.replace("/integrations")
      }, 100)
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
      // First try to refresh tokens, then fetch updated integration data
      const refreshResult = await refreshTokens()

      if (refreshResult.refreshedCount > 0) {
        toast({
          title: "Tokens Refreshed",
          description: `Refreshed ${refreshResult.refreshedCount} integration${refreshResult.refreshedCount > 1 ? "s" : ""}`,
        })
      } else {
        toast({
          title: "Refreshed",
          description: "Integration data has been refreshed.",
        })
      }
    } catch (err: any) {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh integration data. Please try again.",
        variant: "destructive",
      })
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
