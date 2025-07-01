"use client"

import { useEffect } from "react"
import { useIntegrationsStore, Integration } from "@/stores/integrationCacheStore"
import { useIntegrationsCache } from "@/hooks/use-integrations-cache"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface SSRIntegrationsExampleProps {
  serverIntegrations: Integration[]
}

/**
 * Client component that receives server-fetched integrations and hydrates the store
 */
export function SSRIntegrationsExample({ serverIntegrations }: SSRIntegrationsExampleProps) {
  // Get access to the store and hook
  const setStoreData = useIntegrationsStore(state => state.setData)
  const { 
    integrations, 
    loading, 
    error,
    refreshIntegrations,
    disconnectIntegration,
    connectIntegration,
    connectingProvider
  } = useIntegrationsCache()
  
  // Hydrate the store with server data on mount
  useEffect(() => {
    if (serverIntegrations && serverIntegrations.length > 0) {
      console.log("Hydrating integrations store with server data:", serverIntegrations.length)
      setStoreData(serverIntegrations)
    }
  }, [serverIntegrations, setStoreData])
  
  // Force refresh function
  const handleRefresh = async () => {
    try {
      await refreshIntegrations(true)
    } catch (err) {
      console.error("Error refreshing integrations:", err)
    }
  }
  
  // Handle connect click
  const handleConnect = async (provider: string) => {
    try {
      await connectIntegration(provider)
    } catch (err) {
      console.error(`Error connecting ${provider}:`, err)
    }
  }
  
  // Handle disconnect click
  const handleDisconnect = async (integrationId: string) => {
    try {
      await disconnectIntegration(integrationId)
    } catch (err) {
      console.error("Error disconnecting integration:", err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Your Integrations</h2>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500">
            {serverIntegrations.length > 0 ? (
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md">
                Initial data from server
              </span>
            ) : (
              <span>No server data</span>
            )}
          </div>
          <Button onClick={handleRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>
      
      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md">
          Error loading integrations: {error}
        </div>
      )}
      
      {integrations === null && loading ? (
        <div className="text-center py-12">Loading your integrations...</div>
      ) : integrations && integrations.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((integration) => (
            <Card key={integration.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{integration.provider}</CardTitle>
                  <Badge 
                    variant={integration.status === "connected" ? "default" : "destructive"}
                  >
                    {integration.status}
                  </Badge>
                </div>
                <CardDescription>
                  Connected: {new Date(integration.created_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-2">
                  <div>Last updated: {new Date(integration.updated_at).toLocaleString()}</div>
                  {integration.lastRefreshTime && (
                    <div>Token refreshed: {new Date(integration.lastRefreshTime).toLocaleString()}</div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                {integration.status === "connected" ? (
                  <Button 
                    variant="outline" 
                    onClick={() => handleDisconnect(integration.id)}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleConnect(integration.provider)}
                    disabled={connectingProvider === integration.provider}
                  >
                    Reconnect
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-md">
          <p className="text-gray-500 mb-4">You don't have any integrations yet</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => handleConnect("google")}>
              Connect Google
            </Button>
            <Button onClick={() => handleConnect("slack")}>
              Connect Slack
            </Button>
          </div>
        </div>
      )}
    </div>
  )
} 