"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, RefreshCw, Settings, Zap, CheckCircle, AlertTriangle } from "lucide-react"
import IntegrationCard from "./IntegrationCard"
import ScopeValidationAlert from "./ScopeValidationAlert"
import { useIntegrationStore } from "@/stores/integrationStore"

const IntegrationsContent = () => {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { providers, isLoading, error, fetchIntegrations, refreshAllTokens } = useIntegrationStore()

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  const handleRefreshAll = async () => {
    setIsRefreshing(true)
    try {
      await refreshAllTokens()
      await fetchIntegrations(true)
    } catch (error) {
      console.error("Failed to refresh integrations:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Filter providers based on search and category
  const filteredProviders = providers.filter((provider) => {
    const matchesSearch =
      provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.description.toLowerCase().includes(searchTerm.toLowerCase())

    if (selectedCategory === "all") return matchesSearch
    if (selectedCategory === "connected") return matchesSearch && provider.connected
    if (selectedCategory === "available") return matchesSearch && !provider.connected && provider.isAvailable !== false
    if (selectedCategory === "productivity") return matchesSearch && provider.category === "productivity"
    if (selectedCategory === "communication") return matchesSearch && provider.category === "communication"
    if (selectedCategory === "storage") return matchesSearch && provider.category === "storage"
    if (selectedCategory === "development") return matchesSearch && provider.category === "development"

    return matchesSearch
  })

  // Get statistics
  const connectedCount = providers.filter((p) => p.connected).length
  const availableCount = providers.filter((p) => p.isAvailable !== false).length
  const totalCount = providers.length

  if (isLoading && providers.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-lg font-medium text-slate-900">Loading integrations...</p>
            <p className="text-sm text-slate-500 mt-2">Setting up your integration workspace</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Scope Validation Alert */}
      <ScopeValidationAlert />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Integrations</h1>
          <p className="text-slate-600 mt-2">Connect your favorite tools and services to automate your workflows</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing..." : "Refresh All"}
          </Button>

          <Button variant="outline" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Connected</p>
                <p className="text-2xl font-bold text-green-600">{connectedCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Available</p>
                <p className="text-2xl font-bold text-blue-600">{availableCount}</p>
              </div>
              <Zap className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total</p>
                <p className="text-2xl font-bold text-slate-900">{totalCount}</p>
              </div>
              <Settings className="h-8 w-8 text-slate-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search integrations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-3 lg:grid-cols-7 w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="connected">Connected</TabsTrigger>
            <TabsTrigger value="available">Available</TabsTrigger>
            <TabsTrigger value="productivity">Productivity</TabsTrigger>
            <TabsTrigger value="communication">Communication</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="development">Development</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-900">Unable to load integrations</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <Button variant="outline" size="sm" onClick={() => fetchIntegrations(true)} className="mt-3">
                  Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProviders.map((provider) => (
          <IntegrationCard key={provider.id} provider={provider} />
        ))}
      </div>

      {/* Empty State */}
      {filteredProviders.length === 0 && !isLoading && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No integrations found</h3>
            <p className="text-slate-600 mb-4">
              {searchTerm ? `No integrations match "${searchTerm}"` : "No integrations available in this category"}
            </p>
            {searchTerm && (
              <Button variant="outline" onClick={() => setSearchTerm("")}>
                Clear search
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading State for Refresh */}
      {isLoading && providers.length > 0 && (
        <div className="fixed bottom-4 right-4 bg-white border border-slate-200 rounded-lg shadow-lg p-4 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
          <span className="text-sm font-medium">Updating integrations...</span>
        </div>
      )}
    </div>
  )
}

export default IntegrationsContent
