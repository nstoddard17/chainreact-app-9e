"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useIntegrationStore } from "@/stores/integrationStore"
import { AlertCircle, CheckCircle, RefreshCw, Settings, Zap } from "lucide-react"

export default function IntegrationsContent() {
  const {
    integrations = [], // Provide default empty array
    providers = [], // Provide default empty array
    loading,
    error,
    fetchIntegrations,
    connectIntegration,
    disconnectIntegration,
    refreshTokens,
    hydrated,
  } = useIntegrationStore()

  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (hydrated) {
      fetchIntegrations()
    }
  }, [hydrated, fetchIntegrations])

  const handleConnect = async (providerId: string) => {
    try {
      await connectIntegration(providerId)
    } catch (error) {
      console.error("Failed to connect:", error)
    }
  }

  const handleDisconnect = async (integrationId: string) => {
    try {
      await disconnectIntegration(integrationId)
    } catch (error) {
      console.error("Failed to disconnect:", error)
    }
  }

  const handleRefreshTokens = async () => {
    setRefreshing(true)
    try {
      await refreshTokens()
    } catch (error) {
      console.error("Failed to refresh tokens:", error)
    } finally {
      setRefreshing(false)
    }
  }

  const getIntegrationForProvider = (providerId: string) => {
    return integrations.find((integration) => integration.provider === providerId)
  }

  const getStatusBadge = (providerId: string) => {
    const integration = getIntegrationForProvider(providerId)
    if (!integration) {
      return <Badge variant="secondary">Not Connected</Badge>
    }

    switch (integration.status) {
      case "connected":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Connected
          </Badge>
        )
      case "error":
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        )
      default:
        return <Badge variant="secondary">Disconnected</Badge>
    }
  }

  const groupedProviders = providers.reduce(
    (acc, provider) => {
      if (!acc[provider.category]) {
        acc[provider.category] = []
      }
      acc[provider.category].push(provider)
      return acc
    },
    {} as Record<string, typeof providers>,
  )

  if (!hydrated) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Integrations</h1>
            <p className="text-muted-foreground">
              Connect your favorite tools and services to automate your workflows.
            </p>
          </div>
          <Button
            onClick={handleRefreshTokens}
            disabled={refreshing}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Tokens
          </Button>
        </div>
      </div>

      {error && (
        <Alert className="mb-6" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && (
        <div className="space-y-8">
          {Object.entries(groupedProviders).map(([category, categoryProviders]) => (
            <div key={category}>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                {category}
                <Badge variant="outline">{categoryProviders.length}</Badge>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categoryProviders.map((provider) => {
                  const integration = getIntegrationForProvider(provider.id)
                  const isConnected = integration?.status === "connected"

                  return (
                    <Card key={provider.id} className="relative">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <img
                              src={provider.logoUrl || "/placeholder.svg"}
                              alt={`${provider.name} logo`}
                              className="w-10 h-10 rounded"
                            />
                            <div>
                              <CardTitle className="text-lg">{provider.name}</CardTitle>
                              {getStatusBadge(provider.id)}
                            </div>
                          </div>
                          {isConnected && (
                            <Button variant="ghost" size="sm">
                              <Settings className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        <CardDescription className="mt-2">{provider.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium mb-2">Capabilities</h4>
                            <div className="flex flex-wrap gap-1">
                              {provider.capabilities.slice(0, 3).map((capability) => (
                                <Badge key={capability} variant="outline" className="text-xs">
                                  {capability}
                                </Badge>
                              ))}
                              {provider.capabilities.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{provider.capabilities.length - 3} more
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {isConnected ? (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => integration && handleDisconnect(integration.id)}
                                className="flex-1"
                              >
                                Disconnect
                              </Button>
                            ) : (
                              <Button
                                onClick={() => handleConnect(provider.id)}
                                className="flex-1"
                                disabled={!provider.isAvailable}
                              >
                                {provider.isAvailable ? "Connect" : "Coming Soon"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && providers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No integrations available at the moment.</p>
        </div>
      )}
    </div>
  )
}
