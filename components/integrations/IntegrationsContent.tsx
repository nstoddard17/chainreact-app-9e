"use client"

import { useEffect, useState } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"
import IntegrationDiagnostics from "./IntegrationDiagnostics"

export default function IntegrationsContent() {
  const {
    integrations,
    providers,
    loading,
    error,
    fetchIntegrations,
    connectIntegration,
    disconnectIntegration,
    refreshTokens,
    handleOAuthSuccess,
  } = useIntegrationStore()
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // Handle OAuth success/error from URL params
  useEffect(() => {
    const success = searchParams?.get("success")
    const error = searchParams?.get("error")
    const provider = searchParams?.get("provider")
    const message = searchParams?.get("message")

    if (success && provider) {
      toast({
        title: "Integration Connected",
        description: `Successfully connected ${provider}`,
        variant: "default",
      })

      console.log("OAuth success detected in URL, handling...")
      handleOAuthSuccess()

      // Force refresh after a delay
      setTimeout(() => {
        console.log("Forcing integration refresh after delay")
        fetchIntegrations(true)
      }, 2000)
    }

    if (error && provider) {
      toast({
        title: "Integration Error",
        description: message || `Failed to connect ${provider}: ${error}`,
        variant: "destructive",
      })
    }

    // Clean up URL parameters if they exist
    if ((success || error) && typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.search = ""
      window.history.replaceState({}, "", url.toString())
    }
  }, [searchParams, toast, handleOAuthSuccess, fetchIntegrations])

  // Initial fetch
  useEffect(() => {
    fetchIntegrations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConnect = async (providerId: string) => {
    try {
      setConnecting(providerId)
      await connectIntegration(providerId)
    } catch (error: any) {
      toast({
        title: "Connection Error",
        description: error.message || "Failed to start connection process",
        variant: "destructive",
      })
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = async (integrationId: string, provider: string) => {
    try {
      setDisconnecting(integrationId)
      await disconnectIntegration(integrationId)
      toast({
        title: "Integration Disconnected",
        description: `Successfully disconnected ${provider}`,
      })
    } catch (error: any) {
      toast({
        title: "Disconnection Error",
        description: error.message || "Failed to disconnect integration",
        variant: "destructive",
      })
    } finally {
      setDisconnecting(null)
    }
  }

  const handleRefreshTokens = async () => {
    try {
      setRefreshing(true)
      const result = await refreshTokens()

      if (result.success) {
        toast({
          title: "Tokens Refreshed",
          description:
            result.refreshedCount > 0
              ? `Successfully refreshed ${result.refreshedCount} integration tokens`
              : "Integration data refreshed",
        })
      } else {
        toast({
          title: "Refresh Failed",
          description: result.message || "Failed to refresh tokens",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      toast({
        title: "Refresh Error",
        description: error.message || "Failed to refresh tokens",
        variant: "destructive",
      })
    } finally {
      setRefreshing(false)
    }
  }

  // Group providers by category
  const groupedProviders = providers.reduce(
    (acc, provider) => {
      const category = provider.category || "Other"
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(provider)
      return acc
    },
    {} as Record<string, typeof providers>,
  )

  // Sort categories
  const sortedCategories = Object.keys(groupedProviders).sort((a, b) => {
    const order = [
      "Productivity",
      "Communication",
      "Development",
      "Social",
      "Storage",
      "Project Management",
      "Marketing",
      "CRM",
      "E-commerce",
      "Payments",
      "Other",
    ]
    return order.indexOf(a) - order.indexOf(b)
  })

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
          <p className="text-muted-foreground mt-1">Connect your favorite tools and services</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            fetchIntegrations(true)
            handleRefreshTokens()
          }}
          disabled={loading || refreshing}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="available">
        <TabsList className="mb-6">
          <TabsTrigger value="available">Available Integrations</TabsTrigger>
          <TabsTrigger value="connected">
            Connected
            {integrations.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {integrations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
        </TabsList>

        <TabsContent value="available">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <Skeleton className="h-8 w-8 rounded-full mb-2" />
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-full mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3 mt-2" />
                  </CardContent>
                  <CardFooter>
                    <Skeleton className="h-10 w-full" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div>
              {sortedCategories.map((category) => (
                <div key={category} className="mb-8">
                  <h2 className="text-xl font-semibold mb-4">{category}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedProviders[category].map((provider) => {
                      const isConnected = integrations.some(
                        (i) => i.provider === provider.id && i.status === "connected",
                      )
                      return (
                        <Card key={provider.id} className="overflow-hidden">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                                <img
                                  src={provider.logoUrl || "/placeholder.svg"}
                                  alt={provider.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <CardTitle className="text-lg">{provider.name}</CardTitle>
                            </div>
                            <CardDescription className="mt-2">{provider.description}</CardDescription>
                          </CardHeader>
                          <CardContent className="pb-2">
                            <div className="flex flex-wrap gap-2">
                              {provider.capabilities.map((capability) => (
                                <Badge key={capability} variant="secondary">
                                  {capability}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                          <CardFooter>
                            {isConnected ? (
                              <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                  const integration = integrations.find(
                                    (i) => i.provider === provider.id && i.status === "connected",
                                  )
                                  if (integration) {
                                    handleDisconnect(integration.id, provider.name)
                                  }
                                }}
                                disabled={
                                  disconnecting ===
                                  integrations.find((i) => i.provider === provider.id && i.status === "connected")?.id
                                }
                              >
                                {disconnecting ===
                                integrations.find((i) => i.provider === provider.id && i.status === "connected")?.id ? (
                                  <>
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                    Disconnecting...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Connected
                                  </>
                                )}
                              </Button>
                            ) : provider.isAvailable ? (
                              <Button
                                className="w-full"
                                onClick={() => handleConnect(provider.id)}
                                disabled={connecting === provider.id}
                              >
                                {connecting === provider.id ? (
                                  <>
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                    Connecting...
                                  </>
                                ) : (
                                  "Connect"
                                )}
                              </Button>
                            ) : (
                              <Button className="w-full" disabled>
                                Coming Soon
                              </Button>
                            )}
                          </CardFooter>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="connected">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <Skeleton className="h-8 w-8 rounded-full mb-2" />
                    <Skeleton className="h-5 w-40" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3 mt-2" />
                  </CardContent>
                  <CardFooter>
                    <Skeleton className="h-10 w-full" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : integrations.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium mb-2">No Connected Integrations</h3>
              <p className="text-muted-foreground mb-6">Connect your first integration to get started</p>
              <Button onClick={() => document.querySelector('[data-value="available"]')?.click()}>
                Browse Available Integrations
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {integrations.map((integration) => {
                const provider = providers.find((p) => p.id === integration.provider)
                if (!provider) return null

                return (
                  <Card key={integration.id} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                          <img
                            src={provider.logoUrl || "/placeholder.svg"}
                            alt={provider.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{provider.name}</CardTitle>
                          <CardDescription>
                            {integration.metadata?.username || integration.metadata?.user_name || "Connected"}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="text-sm">
                        <div className="flex justify-between mb-1">
                          <span className="text-muted-foreground">Status:</span>
                          <span className="font-medium">{integration.status}</span>
                        </div>
                        <div className="flex justify-between mb-1">
                          <span className="text-muted-foreground">Connected:</span>
                          <span className="font-medium">
                            {new Date(
                              integration.metadata?.connected_at || integration.created_at,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                        {integration.scopes && integration.scopes.length > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Scopes:</span>
                            <span className="font-medium">{integration.scopes.length}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleDisconnect(integration.id, provider.name)}
                        disabled={disconnecting === integration.id}
                      >
                        {disconnecting === integration.id ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Disconnecting...
                          </>
                        ) : (
                          "Disconnect"
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="diagnostics">
          <IntegrationDiagnostics />
        </TabsContent>
      </Tabs>
    </div>
  )
}
