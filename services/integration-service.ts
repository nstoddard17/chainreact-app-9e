import { SessionManager } from "@/lib/auth/session"
import { providerRegistry } from "@/src/domains/integrations/use-cases/provider-registry"
import { IntegrationError, ErrorType } from "@/src/domains/integrations/entities/integration-error"

import { logger } from '@/lib/utils/logger'

export interface Integration {
  id: string
  user_id: string
  provider: string
  status: string
  access_token?: string
  refresh_token?: string
  created_at: string
  updated_at: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
  disconnected_at?: string | null
  disconnect_reason?: string | null
  // Workspace context fields
  workspace_type?: 'personal' | 'team' | 'organization'
  workspace_id?: string | null
  connected_by?: string
  // Permission level for current user
  user_permission?: 'use' | 'manage' | 'admin' | null
  [key: string]: any
}

export interface Provider {
  id: string
  name: string
  icon: string
  isAvailable: boolean
  authUrl?: string
  scopes?: string[]
  [key: string]: any
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * IntegrationService handles all API operations for integrations
 * Extracted from integrationStore.ts for better separation of concerns
 */
export class IntegrationService {
  
  /**
   * Fetch all available integration providers
   */
  static async fetchProviders(): Promise<Provider[]> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch("/api/integrations/available", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch providers: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.integrations || []
  }

  /**
   * Fetch user's connected integrations with retry logic
   *
   * @param force - Force refresh cache
   * @param workspaceType - Workspace type ('personal' | 'team' | 'organization')
   * @param workspaceId - Workspace ID (required for team/organization)
   */
  static async fetchIntegrations(
    force = false,
    workspaceType: 'personal' | 'team' | 'organization' = 'personal',
    workspaceId?: string
  ): Promise<Integration[]> {
    const { user, session } = await SessionManager.getSecureUserAndSession()

    // Retry logic
    const maxRetries = 2
    let lastError: any = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Add timeout to prevent hanging requests (increased to 45 seconds for slower connections)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000) // 45 second timeout

      try {
        logger.debug('🌐 [IntegrationService] Making API call', {
          attempt: attempt + 1,
          force,
          workspaceType,
          workspaceId,
          timestamp: new Date().toISOString()
        });

        // Build query parameters
        const params = new URLSearchParams({
          workspace_type: workspaceType
        })
        if (workspaceId) {
          params.append('workspace_id', workspaceId)
        }

        const response = await fetch(`/api/integrations?${params.toString()}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`Failed to fetch integrations: ${response.statusText}`)
        }

        const data = await response.json()
        const integrations = data.data || []
        return integrations
      } catch (error: any) {
        clearTimeout(timeoutId)
        lastError = error

        // If it's a timeout and we have retries left, try again
        if (error.name === 'AbortError' && attempt < maxRetries) {
          logger.debug(`Integration fetch timeout, retrying... (attempt ${attempt + 1}/${maxRetries})`)
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // If it's the last attempt or not a timeout, throw the error
        if (error.name === 'AbortError') {
          logger.warn('Integration fetch timed out after all retries - returning empty array')
          // Return empty array instead of throwing to prevent page from getting stuck
          // The page can still function with cached data or show a non-blocking error
          return []
        }
        throw error
      }
    }

    // If we get here, all retries failed
    // Return empty array instead of throwing to prevent page from getting stuck
    logger.warn('All integration fetch retries failed - returning empty array', lastError)
    return []
  }

  /**
   * Generate OAuth URL for provider connection
   */
  static async generateOAuthUrl(providerId: string): Promise<{ authUrl: string }> {
    const { user, session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch("/api/integrations/auth/generate-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        provider: providerId,
        userId: user.id,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      
      if (response.status === 401) {
        throw new Error("Authentication expired. Please log in again.")
      } else if (response.status === 403) {
        throw new Error("Access denied. You may not have permission to connect this integration.")
      } else if (response.status === 400 && errorData.message?.includes("localhost")) {
        // Special handling for localhost redirect URI errors
        throw new Error(errorData.message || errorData.error)
      } else {
        throw new Error(errorData.error || `Failed to generate OAuth URL`)
      }
    }

    const data = await response.json()
    
    if (!data.success || !data.authUrl) {
      throw new Error(data.error || "Failed to get auth URL")
    }

    return { authUrl: data.authUrl }
  }

  /**
   * Connect integration using API key
   */
  static async connectApiKeyIntegration(providerId: string, apiKey: string): Promise<void> {
    const { user, session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch("/api/integrations/token-management", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        provider: providerId,
        apiKey: apiKey,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to connect integration")
    }

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.error || "Failed to connect integration")
    }
  }

  /**
   * Disconnect an integration
   */
  static async disconnectIntegration(integrationId: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/integrations/${integrationId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to disconnect integration")
    }
  }

  /**
   * Refresh expired integration tokens
   */
  static async refreshTokens(): Promise<{ refreshed: number; failed: number }> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch("/api/integrations/refresh-tokens", { 
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      throw new Error("Failed to refresh tokens")
    }

    const data = await response.json()
    return {
      refreshed: data.refreshed || 0,
      failed: data.failed || 0
    }
  }

  /**
   * Load data for a specific integration (e.g., Gmail labels, Discord guilds)
   */
  static async loadIntegrationData(
    dataType: string, 
    integrationId: string, 
    params?: Record<string, any>, 
    forceRefresh = false
  ): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    // Use the existing fetch-user-data endpoint for data loading
    const url = `/api/integrations/fetch-user-data`
    const requestBody = {
      integrationId,
      dataType: dataType,
      options: params,
      forceRefresh,
    }

    logger.debug(`🔍 [Integration Service] Loading data:`, {
      dataType,
      integrationId,
      params,
      forceRefresh,
      requestBody,
      message: `About to make API call with dataType: ${dataType}`
    })


    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    })

    if (!response.ok) {
      const status = response.status
      const statusText = response.statusText

      logger.error(`❌ [Integration Service] HTTP error: ${status} ${statusText}`, {
        status,
        statusText,
        dataType,
        integrationId,
        requestBody,
        url
      })

      let errorPayload: any = null

      try {
        errorPayload = await response.clone().json()
      } catch {
        // ignore parse error
      }

      if (status === 401) {
        const errorText = (errorPayload?.error || '').toLowerCase()

        if (errorPayload?.needsReconnection || errorText.includes('reconnect') || errorText.includes('expired')) {
          await IntegrationService.flagIntegrationReconnect(integrationId, errorPayload?.error)
          throw new Error(errorPayload?.error || 'Integration needs to be reconnected. Please reconnect this integration.')
        }

        throw new Error(errorPayload?.error || 'Authentication expired. Please log in again.')
      }

      if (status === 403) {
        throw new Error(errorPayload?.error || 'Access denied for this integration.')
      }

      if (status === 404) {
        throw new Error(errorPayload?.error || 'Integration not found or data not available.')
      }

      // Try to read the error response body for additional context
      let errorMessage = `Failed to load ${dataType} data: ${status} ${statusText}`

      if (errorPayload?.error || errorPayload?.message) {
        errorMessage = errorPayload.error || errorPayload.message
      } else {
        try {
          const errorText = await response.text()
          logger.error(`❌ [Integration Service] Error response:`, errorText)

          if (errorText) {
            try {
              const parsed = JSON.parse(errorText)
              errorMessage = parsed.error || parsed.message || errorMessage
            } catch {
              errorMessage = errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText
            }
          }
        } catch (readError) {
          logger.error(`❌ [Integration Service] Could not read error response:`, readError)
        }
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()
    return data
  }

  private static async flagIntegrationReconnect(integrationId: string, reason?: string) {
    try {
      const { session } = await SessionManager.getSecureUserAndSession()
      await fetch('/api/integrations/flag-reconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ integrationId, reason }),
      })
    } catch (error) {
      logger.warn('[Integration Service] Failed to flag integration reconnect', { integrationId, error })
    }
  }

  static async clearIntegrationReconnect(integrationId: string) {
    try {
      const { session } = await SessionManager.getSecureUserAndSession()
      await fetch('/api/integrations/clear-reconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ integrationId }),
      })
    } catch (error) {
      logger.warn('[Integration Service] Failed to clear integration reconnect flags', { integrationId, error })
    }
  }

  /**
   * Generate OAuth URL for reconnection
   */
  static async generateReconnectionUrl(integration: Integration): Promise<string> {
    const { session } = await SessionManager.getSecureUserAndSession()

    // Ensure provider is valid and properly formatted
    const provider = integration.provider.trim().toLowerCase()
    
    const response = await fetch("/api/integrations/auth/generate-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        provider: provider,
        reconnectId: integration.id,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      
      if (response.status === 401) {
        throw new Error("Authentication expired. Please log in again.")
      } else if (response.status === 403) {
        throw new Error("Access denied for reconnection.")
      }
      
      throw new Error(errorData.error || "Failed to generate reconnection URL")
    }

    const data = await response.json()
    
    if (!data.success || !data.authUrl) {
      throw new Error(data.error || "Failed to get reconnection URL")
    }

    return data.authUrl
  }

  /**
   * Validate integration scopes
   */
  static async validateScopes(providerId: string, grantedScopes: string[]): Promise<{
    isValid: boolean
    missingScopes: string[]
    requiredScopes: string[]
  }> {
    // This would typically call an API endpoint, but for now we'll implement basic validation
    // TODO: Implement proper scope validation API
    
    const scopeMapping: Record<string, string[]> = {
      'gmail': ['https://www.googleapis.com/auth/gmail.modify'],
      'google-drive': ['https://www.googleapis.com/auth/drive'],
      'google-calendar': ['https://www.googleapis.com/auth/calendar'],
      'discord': ['identify', 'guilds'],
      'slack': ['channels:read', 'chat:write'],
      'notion': ['read', 'write'],
      // Add more providers as needed
    }

    const requiredScopes = scopeMapping[providerId] || []
    const missingScopes = requiredScopes.filter(scope => !grantedScopes.includes(scope))
    
    return {
      isValid: missingScopes.length === 0,
      missingScopes,
      requiredScopes
    }
  }

  /**
   * Load integration data (for dynamic field options)
   */
  static async loadIntegrationData(
    dataType: string,
    integrationId: string,
    params?: any,
    forceRefresh = false
  ): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    logger.debug('📡 [IntegrationService] loadIntegrationData called:', { dataType, integrationId, params })

    // The API routes expect a POST request with the data in the body
    const body = {
      integrationId,
      dataType,
      options: params || {}
    }

    // Get provider from dataType (e.g., "airtable_bases" -> "airtable")
    let provider = ''
    if (dataType.startsWith('airtable_') || dataType.startsWith('airtable-')) {
      provider = 'airtable'
    } else if (dataType.startsWith('google_sheets_') || dataType.startsWith('google-sheets-') || dataType.startsWith('google-sheets_')) {
      provider = 'google-sheets'
    } else if (dataType.startsWith('google_drive_') || dataType.startsWith('google-drive-') || dataType.startsWith('google-drive_')) {
      provider = 'google-drive'
    } else if (dataType.startsWith('google_calendar_') || dataType.startsWith('google-calendar-') || dataType.startsWith('google-calendar_')) {
      provider = 'google-calendar'
    } else if (dataType.startsWith('google_docs_') || dataType.startsWith('google-docs-') || dataType.startsWith('google-docs_')) {
      provider = 'google-docs'
    } else if (dataType.startsWith('google_') || dataType.startsWith('google-')) {
      provider = 'google'
    } else if (dataType.startsWith('gmail_') || dataType.startsWith('gmail-')) {
      provider = 'gmail'
    } else if (dataType.startsWith('discord_') || dataType.startsWith('discord-')) {
      provider = 'discord'
    } else if (dataType.startsWith('slack_') || dataType.startsWith('slack-')) {
      provider = 'slack'
    } else if (dataType.startsWith('notion_') || dataType.startsWith('notion-')) {
      provider = 'notion'
    } else if (dataType.startsWith('trello_') || dataType.startsWith('trello-')) {
      provider = 'trello'
    } else if (dataType.startsWith('hubspot_') || dataType.startsWith('hubspot-')) {
      provider = 'hubspot'
    } else if (dataType.startsWith('outlook_') || dataType.startsWith('outlook-')) {
      provider = 'microsoft-outlook'
    } else if (dataType.startsWith('onedrive_') || dataType.startsWith('onedrive-')) {
      provider = 'onedrive'
    } else if (dataType.startsWith('onenote_') || dataType.startsWith('onenote-')) {
      provider = 'onenote'
    } else if (dataType.startsWith('dropbox_') || dataType.startsWith('dropbox-')) {
      provider = 'dropbox'
    } else if (dataType.startsWith('box_') || dataType.startsWith('box-')) {
      provider = 'box'
    } else if (dataType.startsWith('facebook_') || dataType.startsWith('facebook-')) {
      provider = 'facebook'
    } else if (dataType.startsWith('gumroad_') || dataType.startsWith('gumroad-')) {
      provider = 'gumroad'
    } else if (dataType.startsWith('blackbaud_') || dataType.startsWith('blackbaud-')) {
      provider = 'blackbaud'
    } else if (dataType.startsWith('teams_') || dataType.startsWith('teams-')) {
      provider = 'teams'
    } else if (dataType.startsWith('microsoft-teams_') || dataType.startsWith('microsoft-teams-')) {
      provider = 'teams'
    } else {
      // Fallback: try to extract provider from dataType
      // Handle both underscore and dash separators
      provider = dataType.split(/[-_]/)[0]
    }

    logger.debug('🌐 [IntegrationService] Fetching from:', `/api/integrations/${provider}/data`, { body })

    const response = await fetch(`/api/integrations/${provider}/data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to load ${dataType} data`)
    }

    const data = await response.json()
    logger.debug('✅ [IntegrationService] Response for', dataType, ':', {
      dataType,
      hasData: !!data.data,
      dataLength: data.data?.length || data?.length || 0,
      fullResponse: data
    })
    return data.data || data || []
  }

  /**
   * Test integration connection
   */
  static async testConnection(integrationId: string): Promise<{ success: boolean; message?: string }> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/integrations/${integrationId}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        message: errorData.error || "Connection test failed"
      }
    }

    const data = await response.json()
    return {
      success: data.success || false,
      message: data.message
    }
  }

  /**
   * Get integration usage stats
   */
  static async getUsageStats(integrationId: string, timeframe = '30d'): Promise<{
    requests: number
    errors: number
    lastUsed?: string
  }> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/integrations/${integrationId}/usage?timeframe=${timeframe}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      throw new Error("Failed to fetch usage stats")
    }

    const data = await response.json()
    return {
      requests: data.requests || 0,
      errors: data.errors || 0,
      lastUsed: data.lastUsed
    }
  }
}
