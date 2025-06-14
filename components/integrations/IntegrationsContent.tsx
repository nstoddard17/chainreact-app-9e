"use client"

import { useEffect, useState } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import IntegrationCard from "./IntegrationCard"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, RefreshCw, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const categories = [
  "All",
  "Communication",
  "Google Services",
  "Social Media",
  "Development",
  "Productivity",
  "Storage",
  "E-commerce",
  "Payments",
  "Marketing",
  "CRM",
]

export default function IntegrationsContent() {
  const { providers, integrations, loading, error, fetchIntegrations, refreshTokens, refreshing } =
    useIntegrationStore()

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [isRefreshingAll, setIsRefreshingAll] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  const handleRefreshAll = async () => {
    try {
      setIsRefreshingAll(true)
      const result = await refreshTokens()

      if (result.success) {
        toast({
          title: "Tokens Refreshed",
          description: `Successfully refreshed ${result.refreshedCount} integration tokens`,
        })
      } else {
        toast({
          title: "Refresh Failed",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh integration tokens",
        variant: "destructive",
      })
    } finally {
      setIsRefreshingAll(false)
    }
  }

  // Create a map of integrations by provider
  const integrationMap = new Map()
  integrations.forEach((integration) => {
    integrationMap.set(integration.provider, integration)
  })

  // Merge providers with their integration status
  const providersWithStatus = providers.map((provider) => ({
    ...provider,
    integration: integrationMap.get(provider.id) || null,
    connected: integrationMap.has(provider.id) && integrationMap.get(provider.id).status === "connected",
    wasConnected: integrationMap.has(provider.id),
  }))

  // Filter providers based on search and category
  const filteredProviders = providersWithStatus.filter((provider) => {
    const matchesSearch =
      provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === "All" || provider.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  // Group providers by category for display
  const groupedProviders = categories.reduce(
    (acc, category) => {
      if (category === "All") return acc

      const categoryProviders = filteredProviders.filter((p) => p.category === category)
      if (categoryProviders.length > 0) {
        acc[category] = categoryProviders
      }
      return acc
    },
    {} as Record<string, typeof providersWithStatus>,
  )

  const connectedCount = providersWithStatus.filter((p) => p.connected).length
  const totalCount = providersWithStatus.length

  if (loading && integrations.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Integrations</h1>
            <p className="text-slate-600 mt-2">Connect your favorite tools and services</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
          <p className="text-slate-600 mt-2">
            Connect your favorite tools and services • {connectedCount} of {totalCount} connected
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefreshAll}
            disabled={isRefreshingAll || refreshing}
            className="flex items-center gap-2"
          >
            {isRefreshingAll || refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh All
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Search integrations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <Badge
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              className="cursor-pointer hover:bg-slate-100"
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </Badge>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Integrations Grid */}
      {selectedCategory === "All" ? (
        Object.entries(groupedProviders).map(([category, categoryProviders]) => (
          <div key={category} className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categoryProviders.map((provider) => (
                <IntegrationCard key={provider.id} provider={provider} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProviders.map((provider) => (
            <IntegrationCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredProviders.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-slate-500">No integrations found matching your criteria.</p>
        </div>
      )}
    </div>
  )
}
