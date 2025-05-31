"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, ExternalLink, Settings } from "lucide-react"
import { useIntegrationStore } from "@/stores/integrationStore"

interface IntegrationCardProps {
  provider: any
}

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const [connecting, setConnecting] = useState(false)
  const { connectIntegration, disconnectIntegration } = useIntegrationStore()

  const handleConnect = async () => {
    setConnecting(true)
    try {
      await connectIntegration(provider.id)
    } catch (error) {
      console.error("Failed to connect integration:", error)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (provider.integration && confirm("Are you sure you want to disconnect this integration?")) {
      try {
        await disconnectIntegration(provider.integration.id)
      } catch (error) {
        console.error("Failed to disconnect integration:", error)
      }
    }
  }

  return (
    <Card className="bg-white rounded-2xl shadow-lg border border-slate-200 hover:shadow-xl transition-all duration-300">
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
          {provider.connected && (
            <Badge variant="outline" className="bg-white text-black border border-slate-200">
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

        <div className="flex items-center space-x-2 pt-2">
          {provider.connected ? (
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
                {connecting ? "Connecting..." : "Connect"}
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
