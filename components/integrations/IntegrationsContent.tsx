"use client"

import { useState, useEffect } from "react"
import AppLayout from "@/components/layout/AppLayout"
import { useIntegrationStore } from "@/stores/integrationStore"
import IntegrationCard from "./IntegrationCard"
import { Input } from "@/components/ui/input"
import { Search, Loader2, Filter, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

export default function IntegrationsContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const { integrations, providers, loading, fetchIntegrations } = useIntegrationStore()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  useEffect(() => {
    // Handle success/error messages from OAuth callbacks
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    const details = searchParams.get("details")

    if (success === "github_connected") {
      toast({
        title: "GitHub Connected",
        description: "Your GitHub integration has been successfully connected!",
        duration: 5000,
      })
      // Refresh integrations after successful connection
      setTimeout(() => {
        fetchIntegrations()
      }, 1000)
    } else if (error) {
      let errorMessage = "Failed to connect integration"
      switch (error) {
        case "oauth_failed":
          errorMessage = "OAuth authentication failed"
          break
        case "connection_failed":
          errorMessage = "Connection failed"
          break
        case "missing_code":
          errorMessage = "Missing authorization code"
          break
        case "missing_state":
          errorMessage = "Missing state parameter"
          break
        case "session_expired":
          errorMessage = "Your session has expired. Please log in again."
          break
      }

      if (details) {
        errorMessage += `: ${decodeURIComponent(details)}`
      }

      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 7000,
      })
    }

    // Clean up URL parameters
    if (success || error) {
      const url = new URL(window.location.href)
      url.searchParams.delete("success")
      url.searchParams.delete("error")
      url.searchParams.delete("details")
      window.history.replaceState({}, "", url.toString())
    }
  }, [searchParams, toast, fetchIntegrations])

  const categories = Array.from(new Set(providers.map((p) => p.category)))

  const filteredProviders = providers.filter((provider) => {
    const matchesSearch =
      provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.capabilities.some((cap) => cap.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesCategory = !selectedCategory || provider.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  // Merge providers with integration status - this is the key fix
  const providersWithStatus = filteredProviders.map((provider) => {
    const connectedIntegration = integrations.find((i) => i.provider === provider.id && i.status === "connected")
    return {
      ...provider,
      connected: !!connectedIntegration,
      integration: connectedIntegration,
    }
  })

  // Group by category
  const groupedProviders = categories.reduce(
    (acc, category) => {
      acc[category] = providersWithStatus.filter((p) => p.category === category)
      return acc
    },
    {} as Record<string, typeof providersWithStatus>,
  )

  const connectedCount = integrations.filter((i) => i.status === "connected").length

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
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
              onClick={() => fetchIntegrations()}
              variant="outline"
              size="sm"
              className="bg-white text-black border border-slate-200 hover:bg-slate-100"
            >
              Refresh
            </Button>
          </div>
        </div>

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
            {categories.map((category) => (
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

        {/* Debug info - remove in production */}
        {process.env.NODE_ENV === "development" && (
          <div className="bg-gray-100 p-4 rounded-lg text-xs">
            <div>Total integrations: {integrations.length}</div>
            <div>Connected integrations: {connectedCount}</div>
            <div>
              Connected providers:{" "}
              {providersWithStatus
                .filter((p) => p.connected)
                .map((p) => p.name)
                .join(", ") || "None"}
            </div>
          </div>
        )}

        {/* Integrations by Category */}
        {selectedCategory ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 mb-4">{selectedCategory}</h2>
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
              <div key={category}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-slate-900">{category}</h2>
                  <Badge variant="outline" className="bg-white text-black border border-slate-200">
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

        {filteredProviders.length === 0 && (
          <div className="text-center py-12">
            <div className="text-slate-400 text-lg mb-2">No integrations found</div>
            <p className="text-slate-500">Try adjusting your search or filter criteria</p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
