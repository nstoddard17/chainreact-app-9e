"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface IntegrationCardProps {
  name: string
  description: string
  status: string
  provider: string
  integrationId?: string | null
}

export default function IntegrationCard({ name, description, status, provider, integrationId }: IntegrationCardProps) {
  const [connecting, setConnecting] = useState(false)

  const handleConnect = async () => {
    setConnecting(true)

    try {
      // Create a state parameter with provider info
      const stateData = {
        provider,
        reconnect: status === "connected",
        integrationId,
        timestamp: Date.now(),
      }

      const state = btoa(JSON.stringify(stateData))

      // Determine the correct OAuth URL based on the provider
      let authUrl = ""

      switch (provider) {
        case "github":
          authUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + "/api/integrations/github/callback")}&scope=repo,user&state=${state}`
          break
        case "google":
          authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + "/api/integrations/google/callback")}&response_type=code&scope=https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email&state=${state}&access_type=offline&prompt=consent`
          break
        case "slack":
          authUrl = `https://slack.com/oauth/v2/authorize?client_id=${process.env.NEXT_PUBLIC_SLACK_CLIENT_ID}&scope=chat:write,channels:read,channels:history&user_scope=&redirect_uri=${encodeURIComponent(window.location.origin + "/api/integrations/slack/callback")}&state=${state}`
          break
        case "discord":
          authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + "/api/integrations/discord/callback")}&response_type=code&scope=identify%20email&state=${state}`
          break
        case "airtable":
          authUrl = `https://airtable.com/oauth2/v1/authorize?client_id=${process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + "/api/integrations/airtable/callback")}&response_type=code&scope=data.records:read data.records:write schema.bases:read&state=${state}`
          break
        case "dropbox":
          authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + "/api/integrations/dropbox/callback")}&response_type=code&state=${state}`
          break
        // Add more providers as needed
        default:
          throw new Error(`Unsupported provider: ${provider}`)
      }

      // Redirect to the OAuth URL
      window.location.href = authUrl
    } catch (error) {
      console.error(`Error connecting to ${provider}:`, error)
      setConnecting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle>{name}</CardTitle>
          <Badge variant={status === "connected" ? "default" : "outline"}>
            {status === "connected" ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {status === "connected" && (
          <div className="text-sm text-gray-500">Connected and ready to use in your workflows</div>
        )}
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleConnect}
          disabled={connecting}
          variant={status === "connected" ? "outline" : "default"}
          className="w-full"
        >
          {connecting ? "Connecting..." : status === "connected" ? "Reconnect" : "Connect"}
        </Button>
      </CardFooter>
    </Card>
  )
}
