"use client"

import { useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Loader2, RefreshCw, ExternalLink, AlertCircle, X, Link as LinkIcon } from "lucide-react"
import { useIntegrationStore, type Integration, type Provider } from "@/stores/integrationStore"
import { useToast } from "@/hooks/use-toast"
import RedirectLoadingOverlay from "./RedirectLoadingOverlay"
import { cn } from "@/lib/utils"

interface IntegrationCardProps {
  provider: Provider
  integration: Integration | null
}

export function IntegrationCard({ provider, integration }: IntegrationCardProps) {
  const { connectIntegration, disconnectIntegration, loadingStates } = useIntegrationStore()
  const { toast } = useToast()

  const handleConnect = () => {
    connectIntegration(provider.id)
  }

  const handleDisconnect = () => {
    if (integration) {
      disconnectIntegration(integration.id)
    }
  }

  const handleReconnect = () => {
    // Reconnect should essentially be the same as initial connect
    connectIntegration(provider.id)
  }

  const isLoadingConnect = loadingStates[`connect-${provider.id}`]
  const isLoadingDisconnect = integration ? loadingStates[`disconnect-${integration.provider}`] : false
  const isLoading = isLoadingConnect || isLoadingDisconnect

  const now = new Date()
  const expiresAt = integration?.expires_at ? new Date(integration.expires_at) : null
  
  // Consider expired if the expiry date is in the past
  const isExpired = expiresAt ? expiresAt < now : false;
  
  // Consider expiring soon if the expiry date is within the next 7 days
  const sevenDaysFromNow = new Date(now.setDate(now.getDate() + 7));
  const isExpiringSoon = expiresAt ? expiresAt < sevenDaysFromNow && expiresAt > now : false;

  let statusText = 'Disconnected'
  let statusColor = 'text-gray-500'
  let statusAction = 'connect'

  if (integration?.status === 'connected') {
    if (isExpired) {
      statusText = 'Expired'
      statusColor = 'text-red-500'
      statusAction = 'reconnect'
    } else if (isExpiringSoon) {
      statusText = 'Expiring Soon'
      statusColor = 'text-yellow-600'
      statusAction = 'reconnect'
    } else {
      statusText = 'Connected'
      statusColor = 'text-gray-500'
      statusAction = 'disconnect'
    }
  }

  const renderButton = () => {
    switch (statusAction) {
      case 'connect':
        return (
          <Button onClick={handleConnect} disabled={isLoading} className="bg-black text-white hover:bg-gray-800">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
            Connect
          </Button>
        )
      case 'reconnect':
        return (
          <Button onClick={handleReconnect} disabled={isLoading} variant="outline">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Reconnect
          </Button>
        )
      case 'disconnect':
        return (
          <Button
            onClick={handleDisconnect}
            disabled={isLoading}
            variant="outline"
            className="border-red-500 text-red-500 hover:bg-red-50 hover:text-red-600"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
            Disconnect
          </Button>
        )
      default:
        return null
    }
  }

  return (
    <Card className="flex flex-col justify-between p-4">
      <CardHeader className="flex flex-row items-center justify-between p-2">
        <div className="flex items-center gap-3">
          {provider.logoUrl && <Image src={provider.logoUrl} alt={`${provider.name} logo`} width={32} height={32} />}
          <CardTitle className="text-lg font-semibold">{provider.name}</CardTitle>
        </div>
        <Badge className={`px-2 py-1 text-xs font-medium rounded-full ${statusColor}`}>{statusText}</Badge>
      </CardHeader>
      <CardContent className="p-2">
        {/* Description or other info can go here if needed in the future */}
      </CardContent>
      <CardFooter className="p-2">
        <div className="flex w-full items-center gap-2">
          {renderButton()}
        </div>
      </CardFooter>
    </Card>
  )
}
