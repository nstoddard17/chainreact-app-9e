"use client"

import { useState } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Link as LinkIcon, Link2Off, RefreshCw, Info, X, CheckCircle, Clock, XCircle, AlertTriangle } from "lucide-react"
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
  const [showTeamsWarningDialog, setShowTeamsWarningDialog] = useState(false)

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
          badgeClass: 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300',
          action: 'disconnect'
        }
      case 'expired':
        return {
          icon: <XCircle className="w-3.5 h-3.5" />,
          badgeClass: 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300',
          action: 'reconnect'
        }
      case 'expiring':
        return {
          icon: <Clock className="w-3.5 h-3.5" />,
          badgeClass: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300',
          action: 'reconnect'
        }
      default: // disconnected
        return {
          icon: <X className="w-3.5 h-3.5" />,
          badgeClass: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
          action: 'connect'
        }
    }
  }

  const { icon: statusIcon, badgeClass, action: statusAction } = getStatusUi()

  const renderLogo = () => {
    const logoPath = `/integrations/${provider.id}.svg`
    
    // Handle the case where image fails to load
    const handleImageError = () => {
      setImageError(true)
    }

    if (imageError) {
      // Fallback to colored circle with first letter
      const firstLetter = provider.name.charAt(0).toUpperCase()
      return (
        <div 
          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold"
          style={{ backgroundColor: provider.color || '#6B7280' }}
        >
          {firstLetter}
        </div>
      )
    }

    // Add special class for icons that need inverted colors in dark mode
    const needsInversion = ['airtable', 'github', 'google-docs', 'instagram', 'tiktok', 'x'].includes(provider.id)
    
    return (
      <img
        src={logoPath}
        alt={`${provider.name} logo`}
        className={cn(
          "w-6 h-6 object-contain",
          needsInversion && "dark:invert"
        )}
        onError={handleImageError}
        onLoad={() => setImageError(false)}
      />
    )
  }

  const details = [
    provider.name,
    provider.description,
    integration?.created_at ? `Last connected: ${new Date(integration.created_at).toLocaleString()}` : null,
  ].filter(Boolean).join(' \n ')

  const handleConnectClick = () => {
    // Show warning dialog for Teams integration
    if (provider.id === 'teams') {
      setShowTeamsWarningDialog(true);
      return;
    }
    
    if (status === "expired") {
      onReconnect();
    } else {
      onConnect();
    }
  }

  const handleTeamsConnect = () => {
    setShowTeamsWarningDialog(false);
    if (status === "expired") {
      onReconnect();
    } else {
      onConnect();
    }
  }

  const handleDisconnectConfirm = () => {
    onDisconnect()
    setShowDisconnectDialog(false)
  }

  const isConnected = status === "connected" || status === "expiring"

  // Check if this is a Teams integration with special requirements
  const isTeamsIntegration = provider.id === 'teams'
  const showTeamsUpgradeMessage = isTeamsIntegration && !isConnected

  return (
    <Card className="flex flex-col h-full transition-all duration-200 hover:shadow-lg rounded-xl border border-border bg-card overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between p-5 pb-4 space-y-0">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {renderLogo()}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 
                className="text-base sm:text-lg font-semibold text-card-foreground leading-tight"
                title={provider.name}
              >
                {provider.name === "Blackbaud Raiser's Edge NXT" ? "Blackbaud" : provider.id === 'x' || provider.id === 'twitter' ? 'X' : provider.name}
              </h3>
              {provider.id === 'teams' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowTeamsWarningDialog(true);
                        }}
                        className="p-0 hover:scale-110 transition-transform"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Click for Teams requirements info</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {showTeamsUpgradeMessage && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowTeamsWarningDialog(true);
                        }}
                        className="p-0 hover:scale-110 transition-transform"
                      >
                        <Info className="w-4 h-4 text-blue-500" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Click for Teams plan requirements</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {integration?.created_at && (
            <span>Connected {new Date(integration.created_at).toLocaleDateString()}</span>
          )}
          {!integration && <span>Not connected</span>}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowInfo(true)}
                >
                  <Info className="h-4 w-4" />
                  <span className="sr-only">View integration details</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View integration details</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="text-sm text-muted-foreground mt-2 line-clamp-2">
          {provider.description}
          {provider.id === 'microsoft-onenote' && (
            <div>
              <span className="block mt-1 text-xs text-blue-600 dark:text-blue-400">
                ⚡ Forces fresh OAuth consent for each connection
              </span>
              {process.env.NODE_ENV === 'development' && (
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const res = await fetch('/api/integrations/microsoft-onenote/debug');
                      const data = await res.json();
                      alert(`OneNote status: ${data.exists ? data.integration.status : 'not found'}`);
                    } catch (err) {
                      console.error('Debug error:', err);
                      alert('Error checking OneNote status');
                    }
                  }}
                  className="text-xs text-gray-500 underline mt-1"
                >
                  Debug Status
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="px-5 py-4 pt-0 flex flex-col gap-2">
        <div className="flex w-full justify-between gap-2">
          {isLoading ? (
            <Button disabled className="w-full">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {status === "connected" ? "Disconnecting..." : "Connecting..."}
            </Button>
          ) : isConnected ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowDisconnectDialog(true)}
            >
              <Link2Off className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={handleConnectClick}
            >
              <LinkIcon className="mr-2 h-4 w-4" />
              {status === "expired" ? "Reconnect" : "Connect"}
            </Button>
          )}

          {isConnected && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleReconnect}
                    disabled={isLoading}
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span className="sr-only">Refresh connection</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh connection</TooltipContent>
              </Tooltip>
            </TooltipProvider>
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

      <Dialog open={showTeamsWarningDialog} onOpenChange={setShowTeamsWarningDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Microsoft Teams Requirements
            </DialogTitle>
            <DialogDescription>
              Please review these requirements before connecting Microsoft Teams.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Work/School Account Required:</strong> Microsoft Teams integration only works with work or school accounts that have Microsoft 365 subscription. Personal accounts (@outlook.com, @hotmail.com) are not supported.
                </div>
              </div>
            </div>
            
            {showTeamsUpgradeMessage && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Business Plan Required:</strong> Teams integration requires a Business, Enterprise, or Admin plan. Please upgrade your account to access this integration.
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowTeamsWarningDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleTeamsConnect}>
              Continue to Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
