"use client"

import { useState, useMemo, memo } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Link as LinkIcon, Link2Off, RefreshCw, Info, X, CheckCircle, Clock, XCircle, AlertTriangle } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
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
import { useIntegrationSelection } from "@/hooks/workflows/useIntegrationSelection"
import { OptimizedImage } from "@/components/ui/optimized-image"

interface IntegrationCardProps {
  provider: IntegrationConfig
  integration: Integration | null
  status: "connected" | "expiring" | "disconnected" | "expired"
  isConfigured: boolean
  onConnect: () => void
  onDisconnect: () => void
  onReconnect: () => void
}

export const IntegrationCard = memo(function IntegrationCard({
  provider,
  integration,
  status,
  isConfigured,
  onConnect,
  onDisconnect,
  onReconnect,
}: IntegrationCardProps) {
  // Only subscribe to the specific loading state for this provider/integration
  const isLoadingConnect = useIntegrationStore(state =>
    state.loadingStates[`connect-${provider.id}`] || false
  )
  const isLoadingDisconnect = useIntegrationStore(state =>
    integration ? state.loadingStates[`disconnect-${integration.provider}`] || false : false
  )

  // Get functions that don't change
  const connectIntegration = useIntegrationStore(state => state.connectIntegration)
  const disconnectIntegration = useIntegrationStore(state => state.disconnectIntegration)
  const reconnectIntegration = useIntegrationStore(state => state.reconnectIntegration)

  const { comingSoonIntegrations } = useIntegrationSelection()
  const [showInfo, setShowInfo] = useState(false)
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)
  const [showTeamsWarningDialog, setShowTeamsWarningDialog] = useState(false)
  const [showOneNoteWarningDialog, setShowOneNoteWarningDialog] = useState(false)
  const [showOutlookWarningDialog, setShowOutlookWarningDialog] = useState(false)
  
  // Check if this integration is coming soon
  const isComingSoon = useMemo(() => {
    return comingSoonIntegrations.has(provider.id)
  }, [comingSoonIntegrations, provider.id])

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

  const isLoading = isLoadingConnect || isLoadingDisconnect

  // Memoize status UI to prevent recreation of React elements
  const statusUi = useMemo(() => {
    switch (status) {
      case 'connected':
        return {
          icon: <CheckCircle className="w-3.5 h-3.5" />,
          badgeClass: 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300',
          borderClass: 'border-green-500 dark:border-green-400',
          action: 'disconnect'
        }
      case 'expired':
        return {
          icon: <XCircle className="w-3.5 h-3.5" />,
          badgeClass: 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300',
          borderClass: 'border-red-500 dark:border-red-400',
          action: 'reconnect'
        }
      case 'expiring':
        return {
          icon: <Clock className="w-3.5 h-3.5" />,
          badgeClass: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300',
          borderClass: 'border-yellow-500 dark:border-yellow-400',
          action: 'reconnect'
        }
      default: // disconnected
        return {
          icon: <X className="w-3.5 h-3.5" />,
          badgeClass: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
          borderClass: 'border-border',
          action: 'connect'
        }
    }
  }, [status])

  const { icon: statusIcon, badgeClass, borderClass, action: statusAction } = statusUi

  // Memoize the logo path and classes to prevent recreation
  const logoPath = useMemo(() => `/integrations/${provider.id}.svg`, [provider.id])

  // Memoize the fallback element to prevent recreation on every render
  const logoFallback = useMemo(() => (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold"
      style={{ backgroundColor: provider.color || '#6B7280' }}
    >
      {provider.name.charAt(0).toUpperCase()}
    </div>
  ), [provider.color, provider.name])

  // Memoize whether the icon needs inversion
  const needsInversion = useMemo(() =>
    ['airtable', 'github', 'google-docs', 'instagram', 'tiktok', 'x'].includes(provider.id),
    [provider.id]
  )

  // Memoize the entire logo component - using OptimizedImage from the merge
  const logo = useMemo(() => (
    <OptimizedImage
      src={logoPath}
      alt={`${provider.name} logo`}
      className={cn(
        "w-6 h-6 object-contain",
        needsInversion && "dark:invert"
      )}
      fallback={logoFallback}
    />
  ), [logoPath, provider.name, needsInversion, logoFallback])

  const details = [
    provider.name,
    provider.description,
    integration?.created_at ? `Last connected: ${new Date(integration.created_at).toLocaleString()}` : null,
  ].filter(Boolean).join(' \n ')

  const handleConnectClick = () => {
    // Show warning dialog for Microsoft integrations that require work/school accounts
    if (provider.id === 'teams') {
      setShowTeamsWarningDialog(true);
      return;
    }
    if (provider.id === 'microsoft-onenote') {
      setShowOneNoteWarningDialog(true);
      return;
    }
    if (provider.id === 'microsoft-outlook') {
      setShowOutlookWarningDialog(true);
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
    handleDisconnect()
    setShowDisconnectDialog(false)
  }

  const isConnected = status === "connected" || status === "expiring"

  // Check if this is a Teams integration with special requirements
  const isTeamsIntegration = provider.id === 'teams'
  const showTeamsUpgradeMessage = isTeamsIntegration && !isConnected

  return (
    <Card className={cn(
      "flex flex-col h-full transition-all duration-200 hover:shadow-lg rounded-xl border-2 bg-card overflow-hidden",
      borderClass
    )}>
      <CardHeader className="flex flex-row items-center justify-between p-5 pb-4 space-y-0">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {logo}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3
                className="text-base sm:text-lg font-semibold text-card-foreground leading-tight"
                title={provider.name}
              >
                {provider.name === "Blackbaud Raiser's Edge NXT" ? "Blackbaud" : provider.id === 'x' || provider.id === 'twitter' ? 'X' : provider.name}
              </h3>
              {(provider.id === 'teams' || provider.id === 'microsoft-onenote' || provider.id === 'microsoft-outlook') && !isComingSoon && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (provider.id === 'teams') setShowTeamsWarningDialog(true);
                          if (provider.id === 'microsoft-onenote') setShowOneNoteWarningDialog(true);
                          if (provider.id === 'microsoft-outlook') setShowOutlookWarningDialog(true);
                        }}
                        className="p-0 hover:scale-110 transition-transform"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Important requirements</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {showTeamsUpgradeMessage && !isComingSoon && (
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
        {!isComingSoon && (
          <Badge
            className={cn(
              "px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ml-3 flex items-center gap-1",
              badgeClass
            )}
          >
            {statusIcon}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="px-5 pb-4 flex-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isComingSoon ? (
            <span>Available in future update</span>
          ) : (
            <>
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
            </>
          )}
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
        {isComingSoon ? (
          <Button disabled className="w-full" variant="outline">
            <Clock className="mr-0 sm:mr-2 h-4 w-4" />
            {/* No text on extra small screens, just icon */}
            <span className="hidden sm:inline md:hidden">Soon</span>
            {/* "Coming Soon" on medium and larger screens */}
            <span className="hidden md:inline">Coming Soon</span>
          </Button>
        ) : (
          <div className="flex w-full justify-between gap-2">
            {isLoading ? (
              <Button disabled className="w-full">
                <LightningLoader size="sm" className="mr-2" />
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
        )}
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

      {/* OneNote Warning Dialog */}
      <Dialog open={showOneNoteWarningDialog} onOpenChange={setShowOneNoteWarningDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Microsoft OneNote Requirements
            </DialogTitle>
            <DialogDescription>
              Please review these requirements before connecting Microsoft OneNote.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Work/School Account Required:</strong> Microsoft OneNote integration only works with work or school accounts that have Microsoft 365 subscription. Personal accounts (@outlook.com, @hotmail.com) are not supported.
                </div>
              </div>
            </div>
            
            {showTeamsUpgradeMessage && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Business Plan Required:</strong> OneNote integration requires a Business, Enterprise, or Admin plan. Please upgrade your account to access this integration.
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowOneNoteWarningDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              setShowOneNoteWarningDialog(false);
              if (status === "expired") {
                onReconnect();
              } else {
                onConnect();
              }
            }}>
              Continue to Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outlook Warning Dialog */}
      <Dialog open={showOutlookWarningDialog} onOpenChange={setShowOutlookWarningDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Microsoft Outlook Requirements
            </DialogTitle>
            <DialogDescription>
              Please review these requirements before connecting Microsoft Outlook.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Work/School Account Required:</strong> Microsoft Outlook integration only works with work or school accounts that have Microsoft 365 subscription. Personal accounts (@outlook.com, @hotmail.com) are not supported.
                </div>
              </div>
            </div>
            
            {showTeamsUpgradeMessage && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Business Plan Required:</strong> Outlook integration requires a Business, Enterprise, or Admin plan. Please upgrade your account to access this integration.
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowOutlookWarningDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              setShowOutlookWarningDialog(false);
              if (status === "expired") {
                onReconnect();
              } else {
                onConnect();
              }
            }}>
              Continue to Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
})
