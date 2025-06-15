"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"
import { useIntegrationStore } from "@/stores/integration-store"
import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"

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

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const { connectIntegration, disconnectIntegration, loadingStates } = useIntegrationStore()
  const isConnecting = loadingStates[`connect-${provider.id}`] || false
  const isDisconnecting = loadingStates[`disconnect-${provider.id}`] || false
  const [localLoading, setLocalLoading] = useState(false)
  const { toast } = useToast()

  const handleConnect = useCallback(async () => {
    try {
      console.log(`🔗 Button clicked for ${provider.name} (${provider.id})`)
      console.log("Provider details:", provider)

      setLocalLoading(true)

      // Show immediate feedback
      toast({
        title: "Starting Connection",
        description: `Connecting to ${provider.name}...`,
        duration: 3000,
      })

      console.log("🔗 Calling connectIntegration...")
      await connectIntegration(provider.id)
      console.log("✅ connectIntegration completed")
    } catch (error: any) {
      console.error(`❌ Failed to connect ${provider.name}:`, error)

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
    } finally {
      setLocalLoading(false)
    }
  }, [provider, connectIntegration, toast])

  const handleDisconnect = useCallback(async () => {
    if (!provider.integration?.id) {
      toast({
        title: "Error",
        description: "No integration found to disconnect",
        variant: "destructive",
      })
      return
    }

    try {
      setLocalLoading(true)
      await disconnectIntegration(provider.integration.id)

      toast({
        title: "Integration Disconnected",
        description: `${provider.name} has been disconnected successfully`,
        duration: 4000,
      })
    } catch (error: any) {
      console.error(`Failed to disconnect ${provider.name}:`, error)
      toast({
        title: "Disconnection Failed",
        description: error.message || `Failed to disconnect ${provider.name}`,
        variant: "destructive",
        duration: 8000,
      })
    } finally {
      setLocalLoading(false)
    }
  }, [provider, disconnectIntegration, toast])

  // Check for pending connections when component mounts
  useEffect(() => {
    const connectingProvider = localStorage.getItem("connecting_provider")
    if (connectingProvider === provider.id) {
      setLocalLoading(true)
      console.log(`Restoring connection state for ${provider.name}`)
    }
  }, [provider.id, provider.name])

  const isLoading = isConnecting || isDisconnecting || localLoading

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
          onClick={provider.connected ? handleDisconnect : handleConnect}
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {isLoading
            ? provider.connected
              ? "Disconnecting..."
              : "Connecting..."
            : provider.connected
              ? "Disconnect"
              : "Connect"}
        </Button>
      </div>

      {/* Debug info in development */}
      {process.env.NODE_ENV === "development" && (
        <div className="mt-2 text-xs text-gray-500 font-mono">
          ID: {provider.id} | Available: {provider.isAvailable ? "Yes" : "No"} | Connected:{" "}
          {provider.connected ? "Yes" : "No"}
        </div>
      )}
    </div>
  )
}
