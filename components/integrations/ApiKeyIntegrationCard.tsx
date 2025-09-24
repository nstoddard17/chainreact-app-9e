'use client'

import { useState, useMemo, memo } from 'react'
import { useIntegrationStore } from '@/stores/integrationStore'
import type { Provider, Integration } from '@/stores/integrationStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Link as LinkIcon, Link2Off, RefreshCw, X, CheckCircle, Clock, XCircle } from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'
import { cn } from '@/lib/utils'
import { ManyChatGuide } from './guides/ManyChatGuide'
import { BeehiivGuide } from './guides/BeehiivGuide'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'

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

interface ApiKeyIntegrationCardProps {
  provider: Provider
  integration: Integration | null
  status: 'connected' | 'expiring' | 'disconnected'
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const ApiKeyIntegrationCard = memo(function ApiKeyIntegrationCard({ provider, integration, status, open, onOpenChange }: ApiKeyIntegrationCardProps) {
  // Use selective subscriptions to prevent re-renders
  const connectApiKeyIntegration = useIntegrationStore(state => state.connectApiKeyIntegration)
  const disconnectIntegration = useIntegrationStore(state => state.disconnectIntegration)

  // Only subscribe to the specific loading states for this card
  const isConnecting = useIntegrationStore(state =>
    state.loadingStates[`connect-${provider.id}`] || false
  )
  const isDisconnecting = useIntegrationStore(state =>
    integration ? state.loadingStates[`disconnect-${integration.provider}`] || false : false
  )

  const [imageError, setImageError] = useState(false)

  const handleDisconnect = () => {
    if (integration) {
      disconnectIntegration(integration.id)
    }
  }

  const isLoading = isConnecting || isDisconnecting

  // Memoize status UI to prevent recreation
  const statusUi = useMemo(() => {
    switch (status) {
      case 'connected':
        return {
          icon: <CheckCircle className="w-3.5 h-3.5" />,
          badgeClass: 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300',
          action: 'disconnect'
        }
      case 'expiring':
        return {
          icon: <Clock className="w-3.5 h-3.5" />,
          badgeClass: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300',
          action: 'disconnect'
        }
      default: // disconnected
        return {
          icon: <X className="w-3.5 h-3.5" />,
          badgeClass: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
          action: 'connect'
        }
    }
  }, [status])

  const { icon: statusIcon, badgeClass: statusBadgeClass, action: statusAction } = statusUi

  // No need to memoize - StaticIntegrationLogo handles its own optimization

  const guideComponents = {
    manychat: ManyChatGuide,
    beehiiv: BeehiivGuide,
  } as const

  const GuideComponent = guideComponents[provider.id as keyof typeof guideComponents]

  return (
    <>
      <Card className="flex flex-col h-full transition-all duration-200 hover:shadow-lg rounded-xl border border-border bg-card overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between p-5 pb-4 space-y-0">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <StaticIntegrationLogo
              providerId={provider.id}
              providerName={provider.name}
              providerColor={provider.color}
            />
            <div className="min-w-0 flex-1">
              <h3 
                className="text-base sm:text-lg font-semibold text-card-foreground leading-tight"
                title={provider.name}
              >
                {provider.name === "Blackbaud Raiser's Edge NXT" ? "Blackbaud" : provider.id === 'x' || provider.id === 'twitter' ? 'X' : provider.name}
              </h3>
            </div>
          </div>
          <Badge 
            className={cn(
              "px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ml-3 flex items-center gap-1",
              statusBadgeClass
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
                  className="flex-1"
                >
                  {isLoading ? <LightningLoader size="sm" className="mr-2" /> : null}
                  Disconnect
                </Button>
                <Button
                  onClick={() => onOpenChange(true)}
                  disabled={isLoading}
                  size="sm"
                  variant="ghost"
                  className="w-10 h-10 p-0 border border-border hover:bg-accent"
                  aria-label="Reconnect"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            ) : status === 'expiring' ? (
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => onOpenChange(true)}
                  disabled={isLoading}
                  size="sm"
                  className="flex-1"
                >
                  {isLoading ? <LightningLoader size="sm" className="mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Reconnect
                </Button>
                <Button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  size="sm"
                  variant="outline"
                  className="w-10 h-10 p-0"
                  aria-label="Disconnect"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => onOpenChange(true)}
                disabled={isLoading}
                size="sm"
                className="w-full"
              >
                {isLoading ? <LightningLoader size="sm" className="mr-2" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                Connect
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
      {GuideComponent && (
        <GuideComponent
          open={open}
          onOpenChange={onOpenChange}
          onConnect={async (apiKey: any) => {
            try {
              await connectApiKeyIntegration(provider.id, apiKey)
            } catch (e) {
              // error is handled in the guide, do not close modal
              throw e
            }
          }}
        />
      )}
    </>
  )
})
