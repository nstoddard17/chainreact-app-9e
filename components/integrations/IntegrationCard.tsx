"use client"

import { useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Link as LinkIcon, Link2Off, RefreshCw, Info, X, CheckCircle, Clock, XCircle } from "lucide-react"
import { useIntegrationStore, type Integration, type Provider } from "@/stores/integrationStore"
import { cn } from "@/lib/utils"
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '@/components/ui/tooltip'

// Colors for the letter avatar
const avatarColors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-red-500",
  "bg-yellow-500",
  "bg-teal-500",
]

const getAvatarColor = (name: string) => {
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return avatarColors[index % avatarColors.length]
}

interface IntegrationCardProps {
  provider: Provider
  integration: Integration | null
  status: 'connected' | 'expiring' | 'disconnected' | 'expired'
}

export function IntegrationCard({ provider, integration, status }: IntegrationCardProps) {
  const { connectIntegration, disconnectIntegration, reconnectIntegration, loadingStates } = useIntegrationStore()
  const [imageError, setImageError] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const handleConnect = () => {
    connectIntegration(provider.id)
  }

  const handleDisconnect = () => {
    if (integration) {
      disconnectIntegration(integration.id)
    }
  }

  const handleReconnect = () => {
    if (integration) {
      reconnectIntegration(integration.id)
    }
  }

  const isLoading = 
    loadingStates[`connect-${provider.id}`] || 
    (integration ? loadingStates[`disconnect-${integration.provider}`] : false)

  const getStatusUi = () => {
    switch (status) {
      case 'connected':
        return {
          icon: <CheckCircle className="w-3.5 h-3.5" />,
          badgeClass: 'bg-green-100 text-green-800',
          action: 'disconnect'
        }
      case 'expired':
        return {
          icon: <XCircle className="w-3.5 h-3.5" />,
          badgeClass: 'bg-red-100 text-red-800',
          action: 'reconnect'
        }
      case 'expiring':
        return {
          icon: <Clock className="w-3.5 h-3.5" />,
          badgeClass: 'bg-yellow-100 text-yellow-800',
          action: 'reconnect'
        }
      default: // disconnected
        return {
          icon: <X className="w-3.5 h-3.5" />,
          badgeClass: 'bg-gray-100 text-gray-800',
          action: 'connect'
        }
    }
  }

  const { icon: statusIcon, badgeClass, action: statusAction } = getStatusUi()

  const renderLogo = () => {
    // Enhanced fallback avatar with better styling
    const getAvatarColor = (name: string) => {
      const colors = [
        "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-pink-500",
        "bg-indigo-500", "bg-red-500", "bg-yellow-500", "bg-teal-500",
        "bg-orange-500", "bg-cyan-500", "bg-emerald-500", "bg-violet-500"
      ]
      const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      return colors[index % colors.length]
    }

    // Use X logo for provider 'x' or 'twitter'
    if ((provider.id === 'x' || provider.id === 'twitter') && !imageError) {
      return (
        <Image
          src={'/integrations/x.svg'}
          alt={'X'}
          width={48}
          height={48}
          className="object-contain"
          onError={() => setImageError(true)}
        />
      )
    }
    if (provider.logoUrl && !imageError) {
      return (
        <Image
          src={provider.logoUrl}
          alt={provider.name}
          width={48}
          height={48}
          className="object-contain"
          onError={() => setImageError(true)}
        />
      )
    }
    return (
      <div className={`flex items-center justify-center w-12 h-12 rounded-lg text-lg font-bold text-white ${getAvatarColor(provider.name)}`}>
        {provider.name.substring(0, 2).toUpperCase()}
      </div>
    )
  }

  // Optional: Compose details for tooltip
  const details = [
    provider.name,
    provider.description,
    integration?.created_at ? `Last connected: ${new Date(integration.created_at).toLocaleString()}` : null,
  ].filter(Boolean).join(' \n ')

  return (
    <Card className="flex flex-col h-full transition-all duration-200 hover:shadow-lg rounded-xl border border-gray-200 bg-white overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between p-5 pb-4 space-y-0">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {renderLogo()}
          <div className="min-w-0 flex-1">
            <h3 
              className="text-base sm:text-lg font-semibold text-gray-900 leading-tight"
              title={provider.name}
            >
              {provider.name === "Blackbaud Raiser's Edge NXT" ? "Blackbaud" : provider.id === 'x' || provider.id === 'twitter' ? 'X' : provider.name}
            </h3>
          </div>
        </div>
        <Badge 
          className={cn(
            "px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ml-3 flex items-center gap-1",
            badgeClass
          )}
        >
          {statusIcon}
        </Badge>
      </CardHeader>

      <CardContent className="px-5 pb-4 flex-1">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {integration?.created_at && (
            <span>Connected {new Date(integration.created_at).toLocaleDateString()}</span>
          )}
          {!integration && <span>Not connected</span>}
          {/* Info icon with click-based popover */}
          <TooltipProvider>
            <Tooltip open={showInfo} onOpenChange={setShowInfo}>
              <TooltipTrigger asChild>
                <button 
                  type="button" 
                  className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={() => setShowInfo(!showInfo)}
                >
                  <Info className="w-4 h-4" aria-label="Integration details" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-sm">
                <div className="font-semibold mb-1">{provider.name === "Blackbaud Raiser's Edge NXT" ? "Blackbaud" : provider.name}</div>
                {integration?.created_at && (
                  <div className="text-xs text-gray-400">Connected: {new Date(integration.created_at).toLocaleString()}</div>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>

      <CardFooter className="p-5 pt-0">
        <div className="w-full">
          {status === 'connected' ? (
            <div className="flex items-center gap-3">
              <Button
                onClick={handleDisconnect}
                disabled={isLoading}
                size="sm"
                variant="outline"
                className="flex-1 bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Disconnect
              </Button>
              <Button
                onClick={handleReconnect}
                disabled={isLoading}
                size="sm"
                variant="ghost"
                className="w-10 h-10 p-0 border border-gray-300 hover:bg-gray-50"
                aria-label="Reconnect"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          ) : status === 'expired' ? (
            <div className="flex items-center gap-3">
              <Button
                onClick={handleReconnect}
                disabled={isLoading}
                size="sm"
                className="flex-1 bg-gray-900 text-white hover:bg-gray-800"
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Reconnect
              </Button>
              <Button
                onClick={handleDisconnect}
                disabled={isLoading}
                size="sm"
                variant="outline"
                className="w-10 h-10 p-0 border border-gray-300 hover:bg-gray-50"
                aria-label="Disconnect"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={isLoading}
              size="sm"
              className="w-full bg-gray-900 text-white hover:bg-gray-800"
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
              Connect
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
