"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"
import { useIntegrationStore } from "@/stores/integration-store"
import { useCallback, useEffect, useState } from "react"
import { toast } from "@/components/ui/use-toast"

// At the top, add proper interface
interface IntegrationCardProps {
  provider: {
    id: string
    name: string
    description: string
    logoUrl?: string
    capabilities: string[]
    isAvailable: boolean
    category?: string
    color?: string
    connected?: boolean
    integration?: any
  }
}

// Update the component to show all integrations even if not connected
export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const { connectIntegration, disconnectIntegration, loadingStates } = useIntegrationStore()
  const isConnecting = loadingStates[`connect-${provider.id}`] || false
  const isDisconnecting = loadingStates[`disconnect-${provider.id}`] || false
  const [isConnectingState, setIsConnecting] = useState(false)

  const handleConnect = useCallback(async () => {
    try {
      console.log(`🔗 Starting connection for ${provider.name} (${provider.id})`)
      setIsConnecting(true)

      // Show immediate feedback
      toast({
        title: "Starting Connection",
        description: `Connecting to ${provider.name}...`,
        duration: 3000,
      })

      await connectIntegration(provider.id)
    } catch (error: any) {
      console.error(`Failed to connect ${provider.name}:`, error)
      setIsConnecting(false)

      let errorMessage = error.message || `Failed to connect ${provider.name}`

      if (error.message?.includes("not configured")) {
        errorMessage = `${provider.name} integration is not configured. Please contact support.`
      } else if (error.message?.includes("Popup blocked")) {
        errorMessage = `Popup was blocked. Please allow popups and try again.`
      }

      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 8000,
      })
    }
  }, [provider, connectIntegration, toast])

  useEffect(() => {
    // Check for pending connections when component mounts
    const connectingProvider = localStorage.getItem("connecting_provider")
    if (connectingProvider === provider.id) {
      setIsConnecting(true)
      console.log(`Restoring connection state for ${provider.name}`)
    }
  }, [provider.id, provider.name])

  // Show the card regardless of connection status
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: provider.color || "#6B7280" }}
          >
            {provider.name.charAt(0)}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{provider.name}</h3>
            <p className="text-sm text-slate-600">{provider.category || "Integration"}</p>
          </div>
        </div>
        <Badge
          variant={provider.connected ? "default" : "secondary"}
          className={provider.connected ? "bg-green-100 text-green-800" : ""}
        >
          {provider.connected ? "Connected" : "Available"}
        </Badge>
      </div>

      <p className="text-sm text-slate-600 mb-4">{provider.description}</p>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {provider.capabilities?.slice(0, 2).join(", ")}
          {provider.capabilities?.length > 2 && ` +${provider.capabilities.length - 2} more`}
        </div>

        <Button
          size="sm"
          variant={provider.connected ? "outline" : "default"}
          onClick={() => {
            if (provider.connected && provider.integration) {
              disconnectIntegration(provider.integration.id)
            } else {
              handleConnect()
            }
          }}
          disabled={isConnecting || isDisconnecting || isConnectingState}
        >
          {isConnecting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {isDisconnecting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {isConnectingState && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {provider.connected ? "Disconnect" : "Connect"}
        </Button>
      </div>
    </div>
  )
}
