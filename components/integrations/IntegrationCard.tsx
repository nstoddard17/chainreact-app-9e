"use client"

import { useState } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Link as LinkIcon, Link2Off, RefreshCw, Info, X, CheckCircle, Clock, XCircle } from "lucide-react"
import { useIntegrationStore, type Provider } from "@/stores/integrationStore"
import { cn } from "@/lib/utils"
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { IntegrationConfig } from "@/lib/integrations/availableIntegrations"
import { Integration } from "@/stores/integrationStore"

interface IntegrationCardProps {
  provider: IntegrationConfig
  integration: Integration | null
  status: "connected" | "expiring" | "disconnected" | "expired"
  isConfigured: boolean
  onConnect: () => void
  onDisconnect: () => void
  onReconnect: () => void
}

export function IntegrationCard({
  provider,
  integration,
  status,
  isConfigured,
  onConnect,
  onDisconnect,
  onReconnect,
}: IntegrationCardProps) {
  const { connectIntegration, disconnectIntegration, reconnectIntegration, loadingStates } = useIntegrationStore()
  const [imageError, setImageError] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)

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

  const formatExpiresAt = (expires_at?: string | null) => {
    if (!expires_at) return null;

    let expiresAtDate: Date;
    if (/^\d+$/.test(expires_at)) {
      expiresAtDate = new Date(parseInt(expires_at, 10) * 1000);
    } else {
      expiresAtDate = new Date(expires_at);
    }

    if (expiresAtDate && !isNaN(expiresAtDate.getTime())) {
      return expiresAtDate.toLocaleString();
    }
    return 'Invalid date';
  };

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
    const logoPath = `/integrations/${provider.id}.svg`
    return (
      <img
        src={logoPath}
        alt={`${provider.name} logo`}
        className="w-6 h-6 object-contain"
      />
    )
  }

  const details = [
    provider.name,
    provider.description,
    integration?.created_at ? `Last connected: ${new Date(integration.created_at).toLocaleString()}` : null,
  ].filter(Boolean).join(' \n ')

  const handleConnectClick = () => {
    if (isConfigured) {
      onConnect()
    }
  }

  const handleDisconnectConfirm = () => {
    onDisconnect()
    setShowDisconnectDialog(false)
  }

  const isConnected = status === "connected" || status === "expiring"

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
                {integration?.expires_at && (
                  <div className="text-xs text-gray-400">Expires: {formatExpiresAt(integration.expires_at)}</div>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>

      <CardFooter className="p-5 pt-0">
        <div className="w-full">
          {isConnected ? (
            <div className="flex space-x-2">
              <Button onClick={() => setShowDisconnectDialog(true)} variant="outline" className="flex-grow">
                Disconnect
              </Button>
              <Button onClick={onReconnect} variant="secondary" size="icon" aria-label="Reconnect">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button onClick={handleConnectClick} disabled={!isConfigured} className="w-full">
              {isConfigured ? (status === "expired" ? "Reconnect" : "Connect") : "Not Configured"}
            </Button>
          )}
        </div>
      </CardFooter>

      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Disconnect</DialogTitle>
            <DialogDescription>Are you sure you want to disconnect {provider.name}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDisconnectDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisconnectConfirm}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
