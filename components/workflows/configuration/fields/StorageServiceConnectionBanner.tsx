"use client"

/**
 * StorageServiceConnectionBanner
 *
 * Shows connection status for the selected storage service
 * Appears below the storage service selector in Gmail Download Attachment action
 */

import React, { useEffect, useState } from 'react'
import { ServiceConnectionSelector } from '../ServiceConnectionSelector'
import { useIntegrationStore } from '@/stores/integrationStore'
import { logger } from '@/lib/utils/logger'

interface StorageServiceConnectionBannerProps {
  /** Selected storage service (google_drive, onedrive, dropbox) */
  storageService: string
  /** Callback when user selects a different connection */
  onConnectionChange?: (connectionId: string) => void
  /** Currently selected connection ID (if any) */
  selectedConnectionId?: string
}

// Map storage service values to provider IDs
const STORAGE_SERVICE_MAP: Record<string, { providerId: string; name: string }> = {
  'google_drive': { providerId: 'google-drive', name: 'Google Drive' },
  'onedrive': { providerId: 'onedrive', name: 'OneDrive' },
  'dropbox': { providerId: 'dropbox', name: 'Dropbox' }
}

export function StorageServiceConnectionBanner({
  storageService,
  onConnectionChange,
  selectedConnectionId
}: StorageServiceConnectionBannerProps) {
  const { integrations, fetchIntegrations } = useIntegrationStore()
  const [isLoading, setIsLoading] = useState(false)

  // Get provider info for the selected storage service
  const providerInfo = STORAGE_SERVICE_MAP[storageService]

  // Don't render if no storage service selected
  if (!storageService || !providerInfo) {
    return null
  }

  const { providerId, name } = providerInfo

  // Get all connections for this storage provider
  const connections = integrations.filter(
    (int) => int.provider === providerId
  ).map((int) => ({
    id: int.id,
    provider: int.provider,
    email: int.email,
    username: int.username,
    accountName: int.account_name,
    account_name: int.account_name,
    avatar_url: int.avatar_url,
    status: int.status as 'connected' | 'disconnected' | 'error' | 'pending',
    workspace_type: int.workspace_type as 'personal' | 'team' | 'organization' | undefined,
    workspace_id: int.workspace_id,
    created_at: int.created_at,
    expires_at: int.expires_at
  }))

  // Get selected connection or default to first connected one
  const selectedConnection = selectedConnectionId
    ? connections.find(c => c.id === selectedConnectionId)
    : connections.find(c => c.status === 'connected') || connections[0]

  // Handle connecting new account
  const handleConnect = async () => {
    setIsLoading(true)
    try {
      logger.info('[StorageServiceConnectionBanner] Initiating OAuth for', providerId)

      // Open OAuth popup
      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        `/api/integrations/${providerId}/authorize?mode=connect`,
        'oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      // Wait for popup to close
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed)
          setIsLoading(false)
          // Refresh integrations after OAuth completes
          setTimeout(() => fetchIntegrations(true), 500)
        }
      }, 500)
    } catch (error: any) {
      logger.error('[StorageServiceConnectionBanner] OAuth error', error)
      setIsLoading(false)
    }
  }

  // Handle reconnecting existing account
  const handleReconnect = async () => {
    if (!selectedConnection) return

    setIsLoading(true)
    try {
      logger.info('[StorageServiceConnectionBanner] Reconnecting account', selectedConnection.id)

      // Open OAuth popup with reconnect mode
      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        `/api/integrations/${providerId}/authorize?integration_id=${selectedConnection.id}&mode=reconnect`,
        'oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      // Wait for popup to close
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed)
          setIsLoading(false)
          // Refresh integrations after OAuth completes
          setTimeout(() => fetchIntegrations(true), 500)
        }
      }, 500)
    } catch (error: any) {
      logger.error('[StorageServiceConnectionBanner] Reconnect error', error)
      setIsLoading(false)
    }
  }

  // Handle deleting a connection
  const handleDeleteConnection = async (connectionId: string) => {
    try {
      logger.info('[StorageServiceConnectionBanner] Deleting connection', connectionId)

      const response = await fetch(`/api/integrations/${connectionId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete connection')
      }

      // Refresh integrations after deletion
      await fetchIntegrations(true)

      // If we deleted the selected connection, notify parent to clear it
      if (connectionId === selectedConnectionId) {
        onConnectionChange?.('')
      }
    } catch (error: any) {
      logger.error('[StorageServiceConnectionBanner] Delete error', error)
      throw error
    }
  }

  return (
    <div className="mt-3">
      <ServiceConnectionSelector
        providerId={providerId}
        providerName={name}
        connections={connections}
        selectedConnection={selectedConnection}
        onSelectConnection={onConnectionChange}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onDeleteConnection={handleDeleteConnection}
        isLoading={isLoading}
        autoFetch={false} // We're managing connections via integrationStore
      />
    </div>
  )
}
