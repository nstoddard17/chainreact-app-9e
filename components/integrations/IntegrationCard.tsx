"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle, ExternalLink, Settings, Unlink } from "lucide-react"
import { initiateOAuth } from "@/app/actions/oauth"
import { useToast } from "@/hooks/use-toast"

interface Integration {
  id?: string
  provider: string
  status: "connected" | "disconnected" | "error"
  metadata?: any
  scopes?: string[]
  connected_at?: string
}

interface IntegrationCardProps {
  integration: Integration
  onReconnect?: () => void
  onDisconnect?: () => void
}

export default function IntegrationCard({ integration, onReconnect, onDisconnect }: IntegrationCardProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const { toast } = useToast()

  const handleConnect = async () => {
    setIsConnecting(true)

    try {
      const result = await initiateOAuth(integration.provider, false)

      if (result.success && result.authUrl) {
        // Redirect to OAuth provider
        window.location.href = result.authUrl
      } else {
        console.error("OAuth initiation failed:", result)

        // Show specific error message
        toast({
          title: "OAuth Configuration Error",
          description: result.error || `Failed to connect to ${getProviderDisplayName(integration.provider)}`,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Connection error:", error)
      toast({
        title: "Connection Error",
        description: `Failed to connect to ${getProviderDisplayName(integration.provider)}: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleReconnect = async () => {
    if (!integration.id) return

    setIsConnecting(true)

    try {
      const result = await initiateOAuth(integration.provider, true, integration.id)

      if (result.success && result.authUrl) {
        // Redirect to OAuth provider
        window.location.href = result.authUrl
      } else {
        console.error("OAuth reconnection failed:", result)

        toast({
          title: "OAuth Configuration Error",
          description: result.error || `Failed to reconnect to ${getProviderDisplayName(integration.provider)}`,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Reconnection error:", error)
      toast({
        title: "Reconnection Error",
        description: `Failed to reconnect to ${getProviderDisplayName(integration.provider)}: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const getStatusIcon = () => {
    switch (integration.status) {
      case "connected":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = () => {
    switch (integration.status) {
      case "connected":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Connected
          </Badge>
        )
      case "error":
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="secondary">Not Connected</Badge>
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <CardTitle className="text-sm font-medium">{getProviderDisplayName(integration.provider)}</CardTitle>
        </div>
        {getStatusBadge()}
      </CardHeader>
      <CardContent>
        <CardDescription className="text-xs text-muted-foreground mb-4">
          {getProviderDescription(integration.provider)}
        </CardDescription>

        {integration.status === "connected" && integration.metadata && (
          <div className="text-xs text-muted-foreground mb-4">
            <p>Connected as: {integration.metadata.user_name || integration.metadata.username || "Unknown"}</p>
            {integration.connected_at && <p>Connected: {new Date(integration.connected_at).toLocaleDateString()}</p>}
          </div>
        )}

        <div className="flex gap-2">
          {integration.status === "connected" ? (
            <>
              <Button size="sm" variant="outline" onClick={handleReconnect} disabled={isConnecting} className="flex-1">
                <Settings className="h-3 w-3 mr-1" />
                {isConnecting ? "Reconnecting..." : "Reconnect"}
              </Button>
              {onDisconnect && (
                <Button size="sm" variant="outline" onClick={onDisconnect} className="flex-1">
                  <Unlink className="h-3 w-3 mr-1" />
                  Disconnect
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" onClick={handleConnect} disabled={isConnecting} className="flex-1">
              <ExternalLink className="h-3 w-3 mr-1" />
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    google: "Google",
    teams: "Microsoft Teams",
    slack: "Slack",
    dropbox: "Dropbox",
    github: "GitHub",
    twitter: "Twitter",
    linkedin: "LinkedIn",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
    paypal: "PayPal",
    shopify: "Shopify",
    trello: "Trello",
    notion: "Notion",
    youtube: "YouTube",
    docker: "Docker",
    gitlab: "GitLab",
    airtable: "Airtable",
    mailchimp: "Mailchimp",
    hubspot: "HubSpot",
    discord: "Discord",
  }

  return displayNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1)
}

function getProviderDescription(provider: string): string {
  const descriptions: Record<string, string> = {
    google: "Connect your Google account for Calendar, Drive, Gmail, and Sheets integration",
    teams: "Connect Microsoft Teams for messaging and collaboration",
    slack: "Connect Slack for team communication and notifications",
    dropbox: "Connect Dropbox for file storage and sharing",
    github: "Connect GitHub for repository management and CI/CD",
    twitter: "Connect Twitter for social media automation",
    linkedin: "Connect LinkedIn for professional networking",
    facebook: "Connect Facebook for social media management",
    instagram: "Connect Instagram for content publishing",
    tiktok: "Connect TikTok for video content management",
    paypal: "Connect PayPal for payment processing",
    shopify: "Connect Shopify for e-commerce management",
    trello: "Connect Trello for project management",
    notion: "Connect Notion for documentation and knowledge management",
    youtube: "Connect YouTube for video content management",
    docker: "Connect Docker Hub for container management",
    gitlab: "Connect GitLab for repository and CI/CD management",
    airtable: "Connect Airtable for database and workflow management",
    mailchimp: "Connect Mailchimp for email marketing",
    hubspot: "Connect HubSpot for CRM and marketing automation",
    discord: "Connect Discord for community management",
  }

  return descriptions[provider] || `Connect ${getProviderDisplayName(provider)} for enhanced workflow automation`
}
