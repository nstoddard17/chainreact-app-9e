import { SessionManager } from "@/lib/auth/session"
import { providerRegistry } from "@/src/domains/integrations/use-cases/provider-registry"
import { IntegrationError, ErrorType } from "@/src/domains/integrations/entities/integration-error"

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
  lastRefreshTime: string | null
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
   * Fetch user's connected integrations
   */
  static async fetchIntegrations(force = false): Promise<Integration[]> {
    const { user, session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch("/api/integrations", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: force ? "no-store" : "default",
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch integrations: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data || []
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
    providerId: string, 
    integrationId: string, 
    params?: Record<string, any>, 
    forceRefresh = false
  ): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    // Use the existing fetch-user-data endpoint for data loading
    const url = `/api/integrations/fetch-user-data`
    const requestBody = {
      integrationId,
      dataType: providerId,
      options: params,
      forceRefresh,
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Authentication expired. Please log in again.")
      } else if (response.status === 403) {
        throw new Error("Access denied for this integration.")
      } else if (response.status === 404) {
        throw new Error("Integration not found or data not available.")
      }
      
      const errorData = await response.json()
      throw new Error(errorData.error || `Failed to load ${providerId} data`)
    }

    const data = await response.json()
    return data
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