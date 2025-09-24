"use client"

import { memo, useCallback } from 'react'
import { IntegrationCard } from './IntegrationCard'
import { ApiKeyIntegrationCard } from './ApiKeyIntegrationCard'
import { useIntegrationStore } from '@/stores/integrationStore'
import { INTEGRATION_CONFIGS } from '@/lib/integrations/availableIntegrations'

interface IntegrationCardWrapperProps {
  providerId: string
  isConfigured: boolean
  openGuideForProviderId: string | null
  onOpenGuideChange: (openId: string | null) => void
}

/**
 * Wrapper component that subscribes to its own integration data
 * This prevents re-renders when other integrations update
 */
export const IntegrationCardWrapper = memo(function IntegrationCardWrapper({
  providerId,
  isConfigured,
  openGuideForProviderId,
  onOpenGuideChange
}: IntegrationCardWrapperProps) {
  // Subscribe only to this specific integration
  const integration = useIntegrationStore(state =>
    state.integrations.find(i => i.provider === providerId) || null
  )

  // Get provider data - this should be from the store to get dynamic data
  const provider = useIntegrationStore(state =>
    state.providers.find(p => p.id === providerId)
  )

  // Get the action functions once (they don't change)
  const connectIntegration = useIntegrationStore(state => state.connectIntegration)
  const disconnectIntegration = useIntegrationStore(state => state.disconnectIntegration)
  const reconnectIntegration = useIntegrationStore(state => state.reconnectIntegration)

  // Get static config
  const providerConfig = INTEGRATION_CONFIGS[providerId]
  if (!provider || !providerConfig) return null

  // Merge provider data with config
  const fullProvider = { ...providerConfig, ...provider }

  // Memoize callbacks with dependencies
  const handleConnect = useCallback(() => {
    connectIntegration(providerId)
  }, [connectIntegration, providerId])

  const handleDisconnect = useCallback(() => {
    if (integration) {
      disconnectIntegration(integration.id)
    }
  }, [disconnectIntegration, integration])

  const handleReconnect = useCallback(() => {
    if (integration) {
      reconnectIntegration(integration.id)
    }
  }, [reconnectIntegration, integration])

  // Calculate status
  let status: "connected" | "expired" | "expiring" | "disconnected" = "disconnected"

  if (integration) {
    if (integration.status === "expired" || integration.status === "needs_reauthorization") {
      status = "expired"
    } else if (integration.expires_at) {
      const expiresAt = new Date(integration.expires_at)
      const now = new Date()
      const tenMinutesMs = 10 * 60 * 1000
      const timeUntilExpiry = expiresAt.getTime() - now.getTime()

      if (expiresAt.getTime() < now.getTime()) {
        status = "expired"
      } else if (timeUntilExpiry < tenMinutesMs) {
        status = "expiring"
      } else {
        status = "connected"
      }
    } else {
      status = "connected"
    }
  }

  // Render appropriate card type
  if (fullProvider.authType === "apiKey") {
    return (
      <ApiKeyIntegrationCard
        provider={fullProvider}
        integration={integration}
        status={status === "connected" || status === "expiring" ? status : "disconnected"}
        open={openGuideForProviderId === providerId}
        onOpenChange={(isOpen) => onOpenGuideChange(isOpen ? providerId : null)}
      />
    )
  }

  return (
    <IntegrationCard
      provider={fullProvider}
      integration={integration}
      status={status}
      isConfigured={isConfigured}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
      onReconnect={handleReconnect}
    />
  )
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return (
    prevProps.providerId === nextProps.providerId &&
    prevProps.isConfigured === nextProps.isConfigured &&
    prevProps.openGuideForProviderId === nextProps.openGuideForProviderId
  )
})