"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, ExternalLink, Settings, Loader2 } from "lucide-react"
import { useIntegrationStore } from "@/stores/integrationStore"

interface IntegrationCardProps {
  provider: any
}

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const [connecting, setConnecting] = useState(false)
  const { integrations, connectIntegration, disconnectIntegration } = useIntegrationStore()

  // Check if this provider is connected
  const connectedIntegration = integrations.find((i) => i.provider === provider.id && i.status === "connected")
  const disconnectedIntegration = integrations.find((i) => i.provider === provider.id && i.status === "disconnected")
  const isConnected = !!connectedIntegration
  const wasConnected = !!disconnectedIntegration

  const handleConnect = async () => {
    if (isConnected) {
      console.log(`${provider.name} is already connected`)
      return
    }

    setConnecting(true)
    try {
      // Always force OAuth for GitHub reconnections
      const forceOAuth = provider.id === "github" || (wasConnected && provider.authType === "oauth")
      await connectIntegration(provider.id, forceOAuth)
    } catch (error) {
      console.error("Failed to connect integration:", error)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (connectedIntegration && confirm("Are you sure you want to disconnect this integration?")) {
      try {
        await disconnectIntegration(connectedIntegration.id)
      } catch (error) {
        console.error("Failed to disconnect integration:", error)
      }
    }
  }

  return (
    <Card
      className={`bg-white rounded-2xl shadow-lg border transition-all duration-300 ${
        isConnected ? "border-green-200 ring-2 ring-green-100 hover:shadow-xl" : "border-slate-200 hover:shadow-xl"
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            {provider.icon ? (
              <img src={provider.icon || "/placeholder.svg"} alt={provider.name} className="w-8 h-8" />
            ) : (
              <div className="w-8 h-8 bg-slate-200 rounded-md flex items-center justify-center">
                <span className="text-xs font-bold text-slate-500">{provider.name.charAt(0)}</span>
              </div>
            )}
            <CardTitle className="text-lg font-semibold text-slate-900">{provider.name}</CardTitle>
          </div>
          {isConnected && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Check className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">{provider.description}</p>

        <div className="flex flex-wrap gap-2">
          {provider.capabilities.slice(0, 3).map((capability: string) => (
            <Badge key={capability} variant="secondary" className="bg-white text-black border border-slate-200">
              {capability}
            </Badge>
          ))}
          {provider.capabilities.length > 3 && (
            <Badge variant="secondary" className="bg-white text-black border border-slate-200">
              +{provider.capabilities.length - 3} more
            </Badge>
          )}
        </div>

        {provider.requiresSetup && !isConnected && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs text-amber-800">
              <strong>Setup Required:</strong> This integration requires OAuth configuration. In demo mode, a mock
              connection will be created.
            </div>
          </div>
        )}

        {isConnected && connectedIntegration?.metadata?.demo && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-xs text-blue-800">
              <strong>Demo Mode:</strong> This is a simulated connection for testing purposes.
            </div>
          </div>
        )}

        {wasConnected && !isConnected && provider.authType === "oauth" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs text-amber-800">
              <strong>Reconnection Required:</strong> Click Connect to re-authenticate with {provider.name}.
            </div>
          </div>
        )}

        <div className="flex items-center space-x-2 pt-2">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-white text-black border border-slate-200 hover:bg-slate-100 active:bg-slate-200"
              >
                <Settings className="w-4 h-4 mr-2" />
                Configure
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-red-600 border border-slate-200 hover:bg-slate-100 hover:text-red-700 active:bg-slate-200"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={handleConnect}
                className="flex-1 bg-white text-black border border-slate-200 hover:bg-slate-100 active:bg-slate-200"
                disabled={connecting}
              >
                {connecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-black border border-slate-200 hover:bg-slate-100 active:bg-slate-200"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
