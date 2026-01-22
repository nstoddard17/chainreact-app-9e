'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { Check, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIntegrationStore } from '@/stores/integrationStore'
import { getProviderDisplayName } from '@/lib/workflows/ai-agent/providerDisambiguation'

interface ConnectionStatusCardProps {
  providerId: string
  onConnected: (email?: string) => void
  onSkip?: () => void
}

/**
 * Maps provider IDs to their actual icon filenames
 */
function getProviderIconPath(providerId: string): string {
  const iconMap: Record<string, string> = {
    'outlook': 'microsoft-outlook',
    'yahoo-mail': 'yahoo-mail',
  }
  return `/integrations/${iconMap[providerId] || providerId}.svg`
}

type ConnectionState = 'checking' | 'not_connected' | 'connecting' | 'connected' | 'error'

export function ConnectionStatusCard({
  providerId,
  onConnected,
  onSkip,
}: ConnectionStatusCardProps) {
  const {
    getIntegrationByProvider,
    connectIntegration,
    loadingStates,
    fetchIntegrations,
  } = useIntegrationStore()

  const [connectionState, setConnectionState] = useState<ConnectionState>('checking')
  const [connectedEmail, setConnectedEmail] = useState<string | undefined>()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const providerName = getProviderDisplayName(providerId)
  const isConnecting = loadingStates[`connect-${providerId}`]

  // Check connection status on mount and when integrations change
  useEffect(() => {
    const checkConnection = async () => {
      setConnectionState('checking')

      // Give a slight delay to ensure integrations are loaded
      await new Promise(resolve => setTimeout(resolve, 100))

      const integration = getIntegrationByProvider(providerId)

      if (integration && integration.status === 'connected') {
        const email = integration.email || integration.provider_email || integration.account_name
        setConnectedEmail(email)
        setConnectionState('connected')
        // Auto-proceed after showing connected state briefly
        setTimeout(() => {
          onConnected(email)
        }, 1000)
      } else {
        setConnectionState('not_connected')
      }
    }

    checkConnection()
  }, [providerId, getIntegrationByProvider, onConnected])

  // Watch for connection state changes during OAuth
  useEffect(() => {
    if (isConnecting) {
      setConnectionState('connecting')
    }
  }, [isConnecting])

  // Listen for integration connected events
  useEffect(() => {
    const handleIntegrationConnected = async (event: CustomEvent) => {
      const detail = event.detail
      if (detail?.providerId === providerId || detail?.provider === providerId) {
        // Force refresh integrations to get latest status
        await fetchIntegrations(true)

        const integration = getIntegrationByProvider(providerId)
        if (integration && integration.status === 'connected') {
          const email = integration.email || integration.provider_email || integration.account_name
          setConnectedEmail(email)
          setConnectionState('connected')
          setErrorMessage(null)
          // Auto-proceed after showing connected state
          setTimeout(() => {
            onConnected(email)
          }, 1200)
        }
      }
    }

    window.addEventListener('integration-connected', handleIntegrationConnected as EventListener)
    return () => {
      window.removeEventListener('integration-connected', handleIntegrationConnected as EventListener)
    }
  }, [providerId, fetchIntegrations, getIntegrationByProvider, onConnected])

  const handleConnect = async () => {
    try {
      setErrorMessage(null)
      setConnectionState('connecting')
      await connectIntegration(providerId)
      // The integration-connected event listener will handle the state update
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to connect')
      setConnectionState('error')
    }
  }

  const handleRetry = () => {
    setErrorMessage(null)
    handleConnect()
  }

  return (
    <div className="py-3 w-full">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        {/* Provider header */}
        <div className="flex items-center gap-3">
          <Image
            src={getProviderIconPath(providerId)}
            alt={providerName}
            width={28}
            height={28}
            className="shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm text-foreground">{providerName}</h4>

            {/* Status text */}
            {connectionState === 'checking' && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Checking connection...
              </p>
            )}
            {connectionState === 'not_connected' && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Not connected
              </p>
            )}
            {connectionState === 'connecting' && (
              <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Connecting...
              </p>
            )}
            {connectionState === 'connected' && (
              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                Connected{connectedEmail ? ` as ${connectedEmail}` : ''}
              </p>
            )}
            {connectionState === 'error' && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {errorMessage || 'Connection failed'}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {connectionState === 'not_connected' && (
          <div className="flex items-center gap-2">
            <Button
              onClick={handleConnect}
              className="flex-1 gap-2"
              size="sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Connect {providerName}
            </Button>
            {onSkip && (
              <Button
                onClick={onSkip}
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
              >
                Skip
              </Button>
            )}
          </div>
        )}

        {connectionState === 'connecting' && (
          <div className="flex items-center gap-2">
            <Button
              disabled
              className="flex-1 gap-2"
              size="sm"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Connecting...
            </Button>
          </div>
        )}

        {connectionState === 'error' && (
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRetry}
              variant="outline"
              className="flex-1 gap-2"
              size="sm"
            >
              Try Again
            </Button>
            {onSkip && (
              <Button
                onClick={onSkip}
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
              >
                Skip
              </Button>
            )}
          </div>
        )}

        {connectionState === 'connected' && (
          <div className="flex items-center justify-center py-1">
            <p className="text-xs text-muted-foreground">
              Continuing to next step...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
