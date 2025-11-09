"use client"

import React, { useMemo, useState, useEffect } from 'react'
import ConfigurationForm from '../ConfigurationForm'
import { ServiceConnectionSelector } from '../ServiceConnectionSelector'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useRouter } from 'next/navigation'
import { getProviderBrandName } from '@/lib/integrations/brandNames'
import { useToast } from '@/hooks/use-toast'

interface SetupTabProps {
  nodeInfo: any
  initialData?: Record<string, any>
  onSave: (data: Record<string, any>) => void
  onCancel: () => void
  onBack?: () => void
  workflowData?: any
  currentNodeId?: string
  integrationName?: string
  isConnectedToAIAgent?: boolean
  isTemplateEditing?: boolean
  templateDefaults?: Record<string, any>
}

/**
 * Setup Tab - Main configuration form with connection status
 *
 * Shows:
 * 1. ServiceConnectionSelector - Account/connection status for the integration
 * 2. ConfigurationForm - All field configuration
 */
export function SetupTab(props: SetupTabProps) {
  const { nodeInfo, integrationName } = props
  const router = useRouter()
  const { getIntegrationByProvider, integrations, fetchIntegrations } = useIntegrationStore()
  const { toast } = useToast()
  const [isConnecting, setIsConnecting] = useState(false)

  // Determine if this node requires an integration connection
  const requiresConnection = useMemo(() => {
    // Nodes without a provider don't need connections (logic nodes, etc.)
    if (!nodeInfo?.providerId) return false

    // Check if this is an actual integration provider (not utility/logic/AI)
    const nonIntegrationProviders = [
      // Logic nodes
      'logic',
      // Scheduling
      'schedule', 'conditional', 'if_then', 'path', 'filter', 'http_request',
      // Utility nodes (providerId: 'utility')
      'utility', 'transformer', 'file_upload', 'extract_website_data',
      'conditional_trigger', 'google_search', 'tavily_search',
      // AI nodes (providerId: 'ai')
      'ai', 'ai_agent', 'ai_router', 'ai_message', 'ai_action'
    ]

    return !nonIntegrationProviders.includes(nodeInfo.providerId)
  }, [nodeInfo?.providerId])

  // Get ALL connections for this provider (not just one)
  const connections = useMemo(() => {
    if (!requiresConnection || !nodeInfo?.providerId) return []

    // Get all integrations that match this provider
    const providerIntegrations = integrations.filter(
      int => int.provider === nodeInfo.providerId
    )

    // Map to Connection format
    return providerIntegrations.map(integration => {
      // Determine UI status based on integration status
      let uiStatus: 'connected' | 'disconnected' | 'error' = 'disconnected'

      if (integration.status === 'connected') {
        uiStatus = 'connected'
      } else if (integration.status === 'expired' || integration.status === 'needs_reauthorization') {
        // Token expired or needs reauth → show as error so user can reconnect
        uiStatus = 'error'
      }

      return {
        id: integration.id,
        email: integration.email,
        username: integration.username,
        accountName: integration.account_name,
        status: uiStatus,
        lastChecked: integration.last_checked ? new Date(integration.last_checked) : undefined,
        // Use disconnect_reason for error message, fallback to generic error
        error: integration.disconnect_reason || integration.error,
      }
    })
  }, [requiresConnection, nodeInfo?.providerId, integrations])

  // Get current/primary connection (first connected one)
  const connection = useMemo(() => {
    return connections.find(c => c.status === 'connected') || connections[0] || undefined
  }, [connections])

  // OAuth popup handler
  const handleConnect = async () => {
    if (!nodeInfo?.providerId) return

    setIsConnecting(true)

    try {
      // Generate OAuth URL
      const response = await fetch('/api/integrations/auth/generate-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: nodeInfo.providerId })
      })

      if (!response.ok) {
        throw new Error('Failed to generate OAuth URL')
      }

      const { authUrl } = await response.json()

      // Open OAuth popup
      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        authUrl,
        'oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      // Cleanup function (defined early for use in handleMessage)
      let broadcastChannel: BroadcastChannel | null = null
      const cleanup = () => {
        window.removeEventListener('message', handleMessage)
        broadcastChannel?.close()
        setIsConnecting(false)
      }

      // Listen for OAuth completion via both postMessage and BroadcastChannel
      const handleMessage = async (event: MessageEvent) => {
        // Verify message is from our OAuth callback
        if (event.data?.type === 'oauth-complete') {
          cleanup()

          if (event.data.success) {
            // Refresh integrations to get the new connection
            // The UI will automatically update to show connected state
            await fetchIntegrations(true)
            // No success toast - the popup already showed beautiful visual feedback
            // and the UI state updates immediately to show the connection
          } else {
            // Only show error toast - helps user understand what went wrong
            toast({
              title: "Connection Failed",
              description: event.data.error || "Failed to connect account. Please try again.",
              variant: "destructive",
            })
          }

          popup?.close()
        }
      }

      window.addEventListener('message', handleMessage)

      // Also listen via BroadcastChannel (more reliable for same-origin)
      try {
        broadcastChannel = new BroadcastChannel('oauth_channel')
        broadcastChannel.onmessage = handleMessage
      } catch (e) {
        // BroadcastChannel not supported
      }

      // Check if popup was blocked
      if (!popup || popup.closed) {
        cleanup()
        toast({
          title: "Popup Blocked",
          description: "Please allow popups for this site and try again.",
          variant: "destructive",
        })
        return
      }

      // Handle popup closed without completion
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed)
          cleanup()
        }
      }, 500)

    } catch (error: any) {
      toast({
        title: "Connection Error",
        description: error.message || "Failed to initiate OAuth flow.",
        variant: "destructive",
      })
      setIsConnecting(false)
    }
  }

  const handleReconnect = () => {
    // Use same OAuth flow for reconnection
    handleConnect()
  }

  const handleChangeAccount = (connectionId: string) => {
    // Update the selected connection
    // This will be handled by ServiceConnectionSelector
    console.log('Selected connection:', connectionId)
  }

  // Get provider display name with proper branding
  const providerName = nodeInfo?.providerId
    ? getProviderBrandName(nodeInfo.providerId)
    : (integrationName || nodeInfo?.category || 'Service')

  return (
    <div className="flex flex-col h-full">
      {/* Connection Status Section */}
      {requiresConnection && nodeInfo?.providerId && (
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <ServiceConnectionSelector
            providerId={nodeInfo.providerId}
            providerName={providerName}
            connections={connections}
            selectedConnection={connection}
            onConnect={handleConnect}
            onReconnect={handleReconnect}
            onSelectConnection={handleChangeAccount}
            isLoading={isConnecting}
          />
        </div>
      )}

      {/* Configuration Form */}
      <div className="flex-1 overflow-hidden">
        <ConfigurationForm {...props} />
      </div>
    </div>
  )
}
