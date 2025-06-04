"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { generateOAuthUrl } from "@/lib/oauth"

interface Integration {
  id: string
  name: string
  description: string
  provider: string
  connected: boolean
}

const IntegrationsContent = () => {
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)

  const integrations: Integration[] = [
    {
      id: "1",
      name: "Google Calendar",
      description: "Connect your Google Calendar to sync events.",
      provider: "google",
      connected: false,
    },
    {
      id: "2",
      name: "Google Drive",
      description: "Connect your Google Drive to manage files.",
      provider: "google_drive",
      connected: true,
    },
    {
      id: "3",
      name: "Slack",
      description: "Connect your Slack workspace to receive notifications.",
      provider: "slack",
      connected: false,
    },
  ]

  const handleConnect = async (provider: string) => {
    try {
      setConnectingProvider(provider)

      // Get base URL from window location
      const baseUrl = window.location.origin

      // Generate secure OAuth URL
      const authUrl = generateOAuthUrl(provider as any, baseUrl)

      // Redirect to OAuth provider
      window.location.href = authUrl
    } catch (error) {
      console.error(`Error connecting to ${provider}:`, error)
      toast({
        title: "Connection Error",
        description: `Failed to connect to ${provider}. Please try again.`,
        variant: "destructive",
      })
      setConnectingProvider(null)
    }
  }

  const handleReconnect = async (integration: any) => {
    try {
      setConnectingProvider(integration.provider)

      // Get base URL from window location
      const baseUrl = window.location.origin

      // Generate secure OAuth URL for reconnection
      const authUrl = generateOAuthUrl(integration.provider as any, baseUrl, true, integration.id)

      // Redirect to OAuth provider
      window.location.href = authUrl
    } catch (error) {
      console.error(`Error reconnecting to ${integration.provider}:`, error)
      toast({
        title: "Reconnection Error",
        description: `Failed to reconnect to ${integration.provider}. Please try again.`,
        variant: "destructive",
      })
      setConnectingProvider(null)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {integrations.map((integration) => (
        <Card key={integration.id}>
          <CardHeader>
            <CardTitle>{integration.name}</CardTitle>
            <CardDescription>{integration.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Provider: {integration.provider}</p>
            <p>Status: {integration.connected ? "Connected" : "Not Connected"}</p>
          </CardContent>
          <CardFooter className="flex justify-between">
            {integration.connected ? (
              <Button
                variant="outline"
                onClick={() => handleReconnect(integration)}
                disabled={connectingProvider === integration.provider}
              >
                {connectingProvider === integration.provider ? "Reconnecting..." : "Reconnect"}
              </Button>
            ) : (
              <Button
                onClick={() => handleConnect(integration.provider)}
                disabled={connectingProvider === integration.provider}
              >
                {connectingProvider === integration.provider ? "Connecting..." : "Connect"}
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

export default IntegrationsContent
