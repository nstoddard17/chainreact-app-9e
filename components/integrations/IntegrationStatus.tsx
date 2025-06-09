"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface IntegrationStatusProps {
  userId: string
  provider: string
  onReconnect?: () => void
}

export function IntegrationStatus({ userId, provider, onReconnect }: IntegrationStatusProps) {
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected" | "error">("loading")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    checkStatus()
  }, [userId, provider])

  async function checkStatus() {
    try {
      setStatus("loading")
      const response = await fetch(`/api/integrations/token-management?userId=${userId}&provider=${provider}`)

      if (!response.ok) {
        setStatus("error")
        return
      }

      const data = await response.json()
      const integration = data.integrations?.find((i: any) => i.provider === provider)

      if (integration?.connected) {
        setStatus("connected")
      } else {
        setStatus("disconnected")
      }
    } catch (error) {
      console.error("Error checking integration status:", error)
      setStatus("error")
    }
  }

  async function handleRefresh() {
    try {
      setIsRefreshing(true)
      const response = await fetch("/api/integrations/token-management", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, provider }),
      })

      const data = await response.json()

      if (data.requiresReauth) {
        toast({
          title: "Reconnection Required",
          description: `Your ${provider} integration needs to be reconnected.`,
          variant: "destructive",
        })

        if (onReconnect) {
          onReconnect()
        }
      } else if (data.tokenRefreshed) {
        toast({
          title: "Token Refreshed",
          description: `Successfully refreshed your ${provider} integration.`,
          variant: "default",
        })
        setStatus("connected")
      } else {
        toast({
          title: "Token Status",
          description: data.message,
          variant: "default",
        })
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      toast({
        title: "Error",
        description: "Failed to refresh integration token.",
        variant: "destructive",
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status === "connected" && (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" /> Connected
        </Badge>
      )}

      {status === "disconnected" && (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          <AlertCircle className="w-3 h-3 mr-1" /> Disconnected
        </Badge>
      )}

      {status === "error" && (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <AlertCircle className="w-3 h-3 mr-1" /> Error
        </Badge>
      )}

      {status === "loading" && (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Loading
        </Badge>
      )}

      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing || status === "loading"}>
        {isRefreshing ? (
          <>
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Refreshing
          </>
        ) : (
          <>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </>
        )}
      </Button>
    </div>
  )
}
