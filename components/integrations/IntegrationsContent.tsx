"use client"

import { useState, useEffect } from "react"
import ScopeValidationAlert from "./ScopeValidationAlert"
import AppLayout from "@/components/layout/AppLayout"
import { useIntegrationStore } from "@/stores/integrationStore"
import IntegrationCard from "./IntegrationCard"
import IntegrationDiagnostics from "./IntegrationDiagnostics"
import { Input } from "@/components/ui/input"
import { Search, Loader2, Filter, CheckCircle, AlertCircle, Stethoscope, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

export default function IntegrationsContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [processingTrello, setProcessingTrello] = useState(false)

  const { integrations, providers, loading, error, fetchIntegrations, clearCache } = useIntegrationStore()

  const searchParams = useSearchParams()
  const { toast } = useToast()

  // Handle initial data loading
  useEffect(() => {
    const loadData = async () => {
      try {
        setLocalLoading(true)
        setLoadError(null)
        await fetchIntegrations(true)
      } catch (err: any) {
        console.error("Failed to load integrations:", err)
        setLoadError(err.message || "Failed to load integrations")
      } finally {
        setLocalLoading(false)
      }
    }

    loadData()
  }, [fetchIntegrations])

  // Handle OAuth callback success/error messages
  useEffect(() => {
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    const provider = searchParams.get("provider")

    if (success) {
      clearCache()
      setTimeout(async () => {
        try {
          await fetchIntegrations(true)
          toast({
            title: "Integration Connected",
            description: `Your ${provider || "integration"} has been successfully connected!`,
            duration: 5000,
          })
        } catch (err) {
          console.error("Failed to refresh integrations after OAuth:", err)
        }
      }, 1000)
    } else if (error) {
      const message = searchParams.get("message") || "Failed to connect integration"
      toast({
        title: "Connection Failed",
        description: decodeURIComponent(message),
        variant: "destructive",
        duration: 7000,
      })
    }

    // Clean up URL parameters
    if (success || error) {
      const url = new URL(window.location.href)
      url.searchParams.delete("success")
      url.searchParams.delete("error")
      url.searchParams.delete("message")
      url.searchParams.delete("provider")
      window.history.replaceState({}, "", url.toString())
    }
  }, [searchParams, toast, fetchIntegrations, clearCache])

  // Get unique categories from providers
  const categories = Array.from(new Set((providers || []).map((p) => p.category)))

  // Filter providers based on search and category
  const filteredProviders = (providers || []).filter((provider) => {
    const matchesSearch =
      provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.capabilities.some((cap) => cap.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesCategory = !selectedCategory || provider.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  // Merge providers with integration status
  const providersWithStatus = (filteredProviders || []).map((provider) => {
    const connectedIntegration = (integrations || []).find(
      (i) => i?.provider === provider.id && i?.status === "connected",
    )
    const disconnectedIntegration = (integrations || []).find(
      (i) => i?.provider === provider.id && i?.status === "disconnected",
    )

    return {
      ...provider,
      connected: !!connectedIntegration,
      wasConnected: !!disconnectedIntegration,
      integration: connectedIntegration || disconnectedIntegration || null,
    }
  })

  // Group providers by category
  const groupedProviders = (categories || []).reduce(
    (acc, category) => {
      acc[category] = providersWithStatus.filter((p) => p.category === category)
      return acc
    },
    {} as Record<string, typeof providersWithStatus>,
  )

  const connectedCount = (integrations || []).filter((i) => i?.status === "connected").length

  const handleRefresh = async () => {
    try {
      setLocalLoading(true)
      setLoadError(null)
      clearCache()
      await fetchIntegrations(true)
      toast({
        title: "Refreshed",
        description: "Integration data has been refreshed.",
      })
    } catch (err: any) {
      console.error("Failed to refresh integrations:", err)
      setLoadError(err.message || "Failed to refresh integrations")
      toast({
        title: "Refresh Failed",
        description: "Could not refresh integration data. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLocalLoading(false)
    }
  }

  // Show loading state
  if (localLoading || processingTrello) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-slate-600">
            {processingTrello ? "Processing Trello integration..." : "Loading integrations..."}
          </p>
        </div>
      </AppLayout>
    )
  }

  // Show error state
  if (loadError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-6 h-6 text-red-500" />
              <h3 className="text-lg font-medium text-red-800">Failed to load integrations</h3>
            </div>
            <p className="mt-2 text-sm text-red-700">{loadError}</p>
            <div className="mt-4 flex space-x-3">
              <Button onClick={handleRefresh} className="bg-white text-black border border-slate-200">
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <ScopeValidationAlert />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Integrations</h1>
            <p className="text-slate-600 mt-1">Connect your favorite tools and services</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm bg-white text-black border border-slate-200">
              <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
              {connectedCount} Connected
            </Badge>
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="bg-white text-black border border-slate-200 hover:bg-slate-100"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="integrations" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="diagnostics" className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              Diagnostics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="integrations" className="space-y-6">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search integrations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-white text-black border border-slate-200"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedCategory === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                  className={`flex items-center gap-2 bg-white text-black border border-slate-200 hover:bg-slate-100 ${
                    selectedCategory === null ? "ring-2 ring-slate-200" : ""
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  All Categories
                </Button>
                {(categories || []).map((category) => (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category)}
                    className={`bg-white text-black border border-slate-200 hover:bg-slate-100 ${
                      selectedCategory === category ? "ring-2 ring-slate-200" : ""
                    }`}
                  >
                    {category}
                  </Button>
                ))}
              </div>
            </div>

            {/* Integrations by Category */}
            {selectedCategory ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-4">{selectedCategory}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {(groupedProviders[selectedCategory] || []).map((provider) => (
                      <IntegrationCard key={provider.id} provider={provider} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {categories.map((category) => (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold text-slate-900">{category}</h2>
                      <Badge variant="outline" className="bg-white text-black border border-slate-200">
                        {groupedProviders[category]?.length || 0} integrations
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {(groupedProviders[category] || []).map((provider) => (
                        <IntegrationCard key={provider.id} provider={provider} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredProviders.length === 0 && (
              <div className="text-center py-12">
                <div className="text-slate-400 text-lg mb-2">No integrations found</div>
                <p className="text-slate-500">Try adjusting your search or filter criteria</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="diagnostics">
            <IntegrationDiagnostics />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
