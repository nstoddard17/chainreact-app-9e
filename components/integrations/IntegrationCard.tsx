"use client"

import { useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, X, Link as LinkIcon } from "lucide-react"
import { useIntegrationStore, type Integration, type Provider } from "@/stores/integrationStore"
import { cn } from "@/lib/utils"

interface IntegrationCardProps {
  provider: Provider
  integration: Integration | null
  status: 'connected' | 'expiring' | 'disconnected'
}

export function IntegrationCard({ provider, integration, status }: IntegrationCardProps) {
  const { connectIntegration, disconnectIntegration, loadingStates } = useIntegrationStore()

  const handleConnect = () => {
    connectIntegration(provider.id)
  }

  const handleDisconnect = () => {
    if (integration) {
      disconnectIntegration(integration.id)
    }
  }

  const handleRefresh = () => {
    // Refresh is functionally the same as connecting again
    connectIntegration(provider.id)
  }

  const isLoading = 
    loadingStates[`connect-${provider.id}`] || 
    (integration ? loadingStates[`disconnect-${integration.provider}`] : false)

  const getStatusUi = () => {
    switch (status) {
      case 'connected':
        return {
          text: 'Connected',
          badgeClass: 'bg-green-100 text-green-800',
          action: 'disconnect'
        }
      case 'expiring':
        return {
          text: 'Expiring',
          badgeClass: 'bg-yellow-100 text-yellow-800',
          action: 'refresh'
        }
      default: // disconnected
        return {
          text: 'Disconnected',
          badgeClass: 'bg-gray-100 text-gray-800',
          action: 'connect'
        }
    }
  }

  const { text: statusText, badgeClass, action: statusAction } = getStatusUi()

  const renderButton = () => {
    switch (statusAction) {
      case 'connect':
        return (
          <Button onClick={handleConnect} disabled={isLoading} size="sm" className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
            Connect
          </Button>
        )
      case 'refresh':
        return (
          <Button onClick={handleRefresh} disabled={isLoading} variant="outline" size="sm" className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        )
      case 'disconnect':
        return (
          <Button
            onClick={handleDisconnect}
            disabled={isLoading}
            variant="destructive"
            size="sm"
            className="w-full"
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
    <Card className="flex flex-col justify-between p-4 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-lg border-gray-200">
        <CardHeader className="flex-row items-start justify-between p-2">
            <div className="flex items-center gap-4">
              {provider.logoUrl && <Image src={provider.logoUrl} alt={`${provider.name} logo`} width={40} height={40} className="rounded-md" />}
              <CardTitle className="text-lg font-semibold">{provider.name}</CardTitle>
            </div>
            <Badge className={cn("px-2.5 py-1 text-xs font-medium", badgeClass)}>{statusText}</Badge>
        </CardHeader>
      <CardContent className="p-2 min-h-[40px]">
        <p className="text-sm text-gray-500 line-clamp-2">{provider.description}</p>
      </CardContent>
      <CardFooter className="p-2">
        {renderButton()}
      </CardFooter>
    </Card>
  )
}
