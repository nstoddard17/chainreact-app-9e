"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { useIntegrationStore } from "@/stores/integrationStore"
import IntegrationCard from "./IntegrationCard"
import { Button } from "@/components/ui/button"
import { RefreshCw, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export default function IntegrationsContent() {
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("All Categories")
  const [isInitialized, setIsInitialized] = useState(false)

  const { providers, integrations, loading, error, fetchIntegrations, clearCache } = useIntegrationStore()

  useEffect(() => {
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    const provider = searchParams.get("provider")

    if (success && provider) {
      toast.success(`Successfully connected to ${provider}!`)
      window.history.replaceState({}, "", "/integrations")
      fetchIntegrations(true)
    }

    if (error) {
      toast.error(`Failed to connect: ${error}`)
      window.history.replaceState({}, "", "/integrations")
    }
  }, [searchParams, fetchIntegrations])

  useEffect(() => {
    if (!isInitialized) {
      fetchIntegrations()
      setIsInitialized(true)
    }
  }, [fetchIntegrations, isInitialized])

  useEffect(() => {
    const handleTrelloCallback = () => {
      const hash = window.location.hash
      if (hash.includes("token=")) {
        const urlParams = new URLSearchParams(hash.substring(1))
        const token = urlParams.get("token")
        const trelloState = searchParams.get("trello_state")

        if (token && trelloState) {
          fetch("/api/integrations/trello/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, state: trelloState }),
          })
            .then((response) => response.json())
            .then((data) => {
              if (data.success) {
                toast.success("Successfully connected to Trello!")
                fetchIntegrations(true)
              } else {
                toast.error("Failed to connect to Trello")
              }
            })
            .catch(() => {
              toast.error("Failed to connect to Trello")
            })

          window.location.hash = ""
          window.history.replaceState({}, "", "/integrations")
        }
      }
    }

    handleTrelloCallback()
  }, [searchParams, fetchIntegrations])

  const categories = [
    "All Categories",
    "Communication",
    "Productivity",
    "Development",
    "E-commerce",
    "Social Media",
    "Marketing",
    "Cloud Storage",
    "Email",
  ]

  const filteredProviders = providers.filter((provider) => {
    const matchesSearch =
      provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === "All Categories" || provider.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const groupedProviders = filteredProviders.reduce(
    (acc, provider) => {
      const category = provider.category
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(provider)
      return acc
    },
    {} as Record<string, typeof providers>,
  )

  const connectedCount = integrations.filter((i) => i.status === "connected").length

  const handleRefresh = () => {
    clearCache()
    fetchIntegrations(true)
    toast.success("Refreshed integrations")
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
            <div className="text-red-600 text-center">
              <h3 className="text-lg font-semibold">Error loading integrations</h3>
              <p className="text-sm">{error}</p>
            </div>
            <Button onClick={handleRefresh} variant="outline" className="bg-white">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <div className="flex flex-col space-y-4 lg:flex-row lg:items-start lg:justify-between lg:space-y-0">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
            <p className="text-gray-600 mt-2">Connect your favorite tools and services</p>
          </div>
          <div className="flex items-center space-x-4">
            <Badge className="bg-green-100 text-green-800 border-green-200 px-3 py-1">
              ✔️ {connectedCount} Connected
            </Badge>
            <Button onClick={handleRefresh} variant="outline" disabled={loading} className="bg-white">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="w-full max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search integrations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white border-gray-200"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                className={`whitespace-nowrap ${
                  selectedCategory === category
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-12">
          {Object.entries(groupedProviders)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryProviders]) => (
              <div key={category} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-gray-900">{category}</h2>
                  <span className="text-sm text-gray-500 font-medium">
                    {categoryProviders.length} integration{categoryProviders.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryProviders.map((provider) => (
                    <IntegrationCard key={provider.id} provider={provider} />
                  ))}
                </div>
              </div>
            ))}
        </div>

        {!loading && filteredProviders.length === 0 && (
          <div className="text-center py-16">
            <div className="text-gray-400 mb-6">
              <Search className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No integrations found</h3>
            <p className="text-gray-600 mb-6">Try adjusting your search terms or category filter</p>
            <Button
              variant="outline"
              className="bg-white"
              onClick={() => {
                setSearchTerm("")
                setSelectedCategory("All Categories")
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
