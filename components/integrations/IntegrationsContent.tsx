"use client"

import { useState, useEffect } from "react"
import AppLayout from "@/components/layout/AppLayout"
import { useIntegrationStore } from "@/stores/integrationStore"
import IntegrationCard from "./IntegrationCard"
import { Input } from "@/components/ui/input"
import { Search, Loader2, Filter, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

export default function IntegrationsContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { integrations, providers, loading, error, fetchIntegrations, clearCache } = useIntegrationStore()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // Handle initial data loading
  useEffect(() => {
    const loadData = async () => {
      try {
        setLocalLoading(true)
        setLoadError(null)
        await fetchIntegrations(true) // Force refresh on initial load
      } catch (err: any) {
        console.error("Failed to load integrations:", err)
        setLoadError(err.message || "Failed to load integrations")
      } finally {
        setLocalLoading(false)
      }
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty dependency array to run only once on mount

  // Handle URL parameters for OAuth callbacks
  useEffect(() => {
    // Handle success/error messages from OAuth callbacks
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    const details = searchParams.get("details")
    const providerId = searchParams.get("providerId")

    if (success) {
      console.log("OAuth success detected:", { success, providerId })

      // Clear cache and force refresh integrations data
      clearCache()

      // Add a longer delay to ensure the database has been updated
      setTimeout(async () => {
        try {
          console.log("Refreshing integrations after OAuth success...")
          await fetchIntegrations(true)

          console.log("Current integrations after refresh:", integrations.length)

          // Show success toast based on the success type
          if (success === "github_connected") {
            toast({
              title: "GitHub Connected",
              description: "Your GitHub integration has been successfully connected!",
              duration: 5000,
            })
          } else if (success === "github_reconnected") {
            toast({
              title: "GitHub Reconnected",
              description: "Your GitHub integration has been successfully reconnected!",
              duration: 5000,
            })
          } else if (success === "slack_connected") {
            toast({
              title: "Slack Connected",
              description: "Your Slack integration has been successfully connected!",
              duration: 5000,
            })
          } else if (success === "slack_reconnected") {
            toast({
              title: "Slack Reconnected",
              description: "Your Slack integration has been successfully reconnected!",
              duration: 5000,
            })
          } else if (success === "google_connected") {
            toast({
              title: "Google Connected",
              description: "Your Google integration has been successfully connected!",
              duration: 5000,
            })
          } else if (success === "google_reconnected") {
            toast({
              title: "Google Reconnected",
              description: "Your Google integration has been successfully reconnected!",
              duration: 5000,
            })
          } else if (success === "discord_connected") {
            toast({
              title: "Discord Connected",
              description: "Your Discord integration has been successfully connected!",
              duration: 5000,
            })
          } else if (success === "discord_reconnected") {
            toast({
              title: "Discord Reconnected",
              description: "Your Discord integration has been successfully reconnected!",
              duration: 5000,
            })
          } else {
            // Generic success message
            toast({
              title: "Integration Connected",
              description: "Your integration has been successfully connected!",
              duration: 5000,
            })
          }
        } catch (err) {
          console.error("Failed to refresh integrations after OAuth:", err)
          toast({
            title: "Refresh Failed",
            description: "Integration connected but failed to refresh the page. Please refresh manually.",
            variant: "destructive",
          })
        }
      }, 2000) // Increased delay to 2 seconds to ensure database is updated
    } else if (error) {
      console.log("OAuth error detected:", { error, details })

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
        case "database_error":
          errorMessage = "Database error occurred while saving integration"
          break
        case "token_exchange_failed":
          errorMessage = "Failed to exchange authorization code for access token"
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
      url.searchParams.delete("providerId")
      window.history.replaceState({}, "", url.toString())
    }
  }, [searchParams, toast, fetchIntegrations, clearCache, integrations.length])

  const categories = Array.from(new Set(providers.map((p) => p.category)))

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
      integration: connectedIntegration || disconnectedIntegration,
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

  const handleRefresh = async () => {
    try {
      setLocalLoading(true)
      setLoadError(null)
      clearCache() // Clear cache before refreshing
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

  const handleClearCache = () => {
    clearCache()
    toast({
      title: "Cache Cleared",
      description: "Integration cache has been cleared.",
    })
    handleRefresh()
  }

  // Add this function to the IntegrationsContent component

  const handleDebug = async () => {
    try {
      const response = await fetch("/api/integrations/debug")
      const data = await response.json()
      console.log("Debug data:", data)
      alert("Debug info logged to console")
    } catch (error) {
      console.error("Debug error:", error)
      alert("Debug error: " + (error as Error).message)
    }
  }

  // Show loading state
  if (localLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-slate-600">Loading integrations...</p>
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
              <Button
                onClick={handleClearCache}
                variant="outline"
                className="bg-white text-black border border-slate-200"
              >
                Clear Cache
              </Button>
            </div>
          </div>
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
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="bg-white text-black border border-slate-200 hover:bg-slate-100"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
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
            <div className="mt-2 flex space-x-2">
              <Button onClick={handleClearCache} size="sm" variant="outline" className="text-xs h-6">
                Clear Cache
              </Button>
              <Button onClick={handleDebug} size="sm" variant="outline" className="text-xs h-6">
                Debug
              </Button>
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
