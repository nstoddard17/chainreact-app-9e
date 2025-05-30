"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useIntegrationStore } from "@/stores/integrationStore"
import { CheckCircle, Circle, Settings, Key, Globe, Loader2 } from "lucide-react"

interface IntegrationCardProps {
  provider: {
    id: string
    name: string
    description: string
    icon: string
    logoColor: string
    authType: "oauth" | "api_key" | "demo"
    capabilities: string[]
    connected: boolean
    integration?: any
    requiresSetup?: boolean
  }
}

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const [loading, setLoading] = useState(false)
  const { connectIntegration, disconnectIntegration } = useIntegrationStore()

  const handleConnect = async () => {
    setLoading(true)
    try {
      await connectIntegration(provider.id)
    } catch (error) {
      console.error("Failed to connect integration:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (provider.integration) {
      setLoading(true)
      try {
        await disconnectIntegration(provider.integration.id)
      } catch (error) {
        console.error("Failed to disconnect integration:", error)
      } finally {
        setLoading(false)
      }
    }
  }

  const getAuthTypeIcon = () => {
    switch (provider.authType) {
      case "oauth":
        return <Globe className="w-4 h-4" />
      case "api_key":
        return <Key className="w-4 h-4" />
      case "demo":
        return <Settings className="w-4 h-4" />
      default:
        return <Circle className="w-4 h-4" />
    }
  }

  const getAuthTypeLabel = () => {
    switch (provider.authType) {
      case "oauth":
        return provider.requiresSetup ? "OAuth (Setup Required)" : "OAuth"
      case "api_key":
        return "API Key"
      case "demo":
        return "Demo Mode"
      default:
        return "Unknown"
    }
  }

  const getAuthTypeColor = () => {
    switch (provider.authType) {
      case "oauth":
        return provider.requiresSetup ? "destructive" : "default"
      case "api_key":
        return "secondary"
      case "demo":
        return "outline"
      default:
        return "outline"
    }
  }

  return (
    <Card
      className={`transition-all duration-200 hover:shadow-md ${provider.connected ? "ring-2 ring-green-200" : ""}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold ${provider.logoColor}`}
            >
              {provider.icon}
            </div>
            <div>
              <CardTitle className="text-lg">{provider.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={getAuthTypeColor() as any} className="text-xs">
                  <div className="flex items-center gap-1">
                    {getAuthTypeIcon()}
                    {getAuthTypeLabel()}
                  </div>
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center">
            {provider.connected ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <Circle className="w-5 h-5 text-slate-300" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <CardDescription className="text-sm">{provider.description}</CardDescription>

        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-600">Capabilities:</div>
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

        {provider.requiresSetup && !provider.connected && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs text-amber-800">
              <strong>Setup Required:</strong> This integration requires OAuth configuration. In demo mode, a mock
              connection will be created.
            </div>
          </div>
        )}

        {provider.connected && provider.integration?.metadata?.demo && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-xs text-blue-800">
              <strong>Demo Mode:</strong> This is a simulated connection for testing purposes.
            </div>
          </div>
        )}

        <div className="pt-2">
          {provider.connected ? (
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={loading}
              className="w-full"
              variant={provider.authType === "demo" ? "outline" : "default"}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {provider.authType === "demo" ? "Connect (Demo)" : "Connect"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
