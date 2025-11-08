import { OAuthPopupManager } from "./popup-manager"
import { IntegrationService } from "@/services/integration-service"
import { ScopeValidator } from "@/lib/integrations/scope-validator"

import { logger } from '@/lib/utils/logger'

export interface ConnectionOptions {
  providerId: string
  onSuccess?: (data: any) => void
  onError?: (error: string) => void
  onCancel?: () => void
  onInfo?: (message: string) => void
  validateScopes?: boolean
  popupOptions?: {
    width?: number
    height?: number
  }
}

export interface ReconnectionOptions {
  integrationId: string
  integration: any
  onSuccess?: () => void
  onError?: (error: string) => void
  onCancel?: () => void
}

export interface ConnectionResult {
  success: boolean
  message?: string
  data?: any
  scopeValidation?: {
    isValid: boolean
    missingScopes: string[]
    warnings?: string[]
  }
}

/**
 * OAuthConnectionFlow orchestrates the complete OAuth connection process
 * Extracted from integrationStore.ts for better separation of concerns
 */
export class OAuthConnectionFlow {
  
  /**
   * Start OAuth connection flow for a provider
   */
  static async startConnection(options: ConnectionOptions): Promise<ConnectionResult> {
    const {
      providerId,
      onSuccess,
      onError,
      onCancel,
      onInfo,
      validateScopes = true,
      popupOptions = { width: 600, height: 700 }
    } = options

    try {
      // Step 1: Generate OAuth URL
      const { authUrl } = await IntegrationService.generateOAuthUrl(providerId)

      // Step 2: Open popup and handle OAuth flow
      const popup = OAuthPopupManager.openOAuthPopup(authUrl, {
        provider: providerId,
        ...popupOptions
      })

      if (!popup) {
        const error = "Failed to open OAuth popup"
        onError?.(error)
        return { success: false, message: error }
      }

      // Step 3: Setup popup listeners and wait for completion
      return new Promise((resolve) => {
        const { cleanup } = OAuthPopupManager.setupPopupListeners(
          popup,
          providerId,
          // onSuccess
          async (data) => {
            try {
              // CRITICAL: Clean up listeners IMMEDIATELY on success
              cleanup()

              // Step 4: Validate scopes if requested
              let scopeValidation
              if (validateScopes && data.scopes) {
                scopeValidation = ScopeValidator.validateScopes(providerId, data.scopes)

                if (!scopeValidation.isValid) {
                  logger.warn(`⚠️ Missing required scopes for ${providerId}:`, scopeValidation.missingScopes)
                }
              }

              const result: ConnectionResult = {
                success: true,
                data,
                scopeValidation
              }

              onSuccess?.(data)
              resolve(result)
            } catch (error) {
              cleanup() // Clean up on error too
              const errorMessage = error instanceof Error ? error.message : "Unknown error during connection"
              onError?.(errorMessage)
              resolve({ success: false, message: errorMessage })
            }
          },
          // onError
          (error) => {
            cleanup() // Clean up on error
            onError?.(error)
            resolve({ success: false, message: error })
          },
          // onCancel
          () => {
            cleanup() // Clean up on cancel
            onCancel?.()
            resolve({ success: false, message: "User cancelled connection" })
          },
          // onInfo
          (message) => {
            cleanup() // Clean up on info
            onInfo?.(message)
            resolve({ success: false, message })
          }
        )
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to start connection"
      onError?.(errorMessage)
      return { success: false, message: errorMessage }
    }
  }

  /**
   * Start reconnection flow for an existing integration
   */
  static async startReconnection(options: ReconnectionOptions): Promise<ConnectionResult> {
    const {
      integrationId,
      integration,
      onSuccess,
      onError,
      onCancel
    } = options

    try {
      // Step 1: Generate reconnection OAuth URL
      const authUrl = await IntegrationService.generateReconnectionUrl(integration)

      // Step 2: Use OAuthPopupManager for reconnection
      await OAuthPopupManager.openReconnectionPopup(
        authUrl,
        integration.provider,
        integrationId
      )

      // Step 3: Success
      onSuccess?.()
      return { success: true, message: "Reconnection successful" }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Reconnection failed"
      
      if (errorMessage.includes("cancelled") || errorMessage.includes("User cancelled")) {
        onCancel?.()
        return { success: false, message: "User cancelled reconnection" }
      } 
        onError?.(errorMessage)
        return { success: false, message: errorMessage }
      
    }
  }

  /**
   * Connect integration using API key (non-OAuth flow)
   */
  static async connectApiKey(
    providerId: string, 
    apiKey: string,
    onSuccess?: () => void,
    onError?: (error: string) => void
  ): Promise<ConnectionResult> {
    try {
      await IntegrationService.connectApiKeyIntegration(providerId, apiKey)
      
      onSuccess?.()
      return { success: true, message: "API key integration connected successfully" }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect API key integration"
      onError?.(errorMessage)
      return { success: false, message: errorMessage }
    }
  }

  /**
   * Test connection for an existing integration
   */
  static async testConnection(
    integrationId: string,
    onSuccess?: (message: string) => void,
    onError?: (error: string) => void
  ): Promise<ConnectionResult> {
    try {
      const result = await IntegrationService.testConnection(integrationId)
      
      if (result.success) {
        onSuccess?.(result.message || "Connection test successful")
        return { success: true, message: result.message }
      } 
        onError?.(result.message || "Connection test failed")
        return { success: false, message: result.message }
      

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Connection test failed"
      onError?.(errorMessage)
      return { success: false, message: errorMessage }
    }
  }

  /**
   * Disconnect an integration
   */
  static async disconnect(
    integrationId: string,
    onSuccess?: () => void,
    onError?: (error: string) => void
  ): Promise<ConnectionResult> {
    try {
      await IntegrationService.disconnectIntegration(integrationId)
      
      onSuccess?.()
      return { success: true, message: "Integration disconnected successfully" }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to disconnect integration"
      onError?.(errorMessage)
      return { success: false, message: errorMessage }
    }
  }

  /**
   * Batch connect multiple integrations
   */
  static async batchConnect(
    connections: Array<{ providerId: string; apiKey?: string }>,
    onProgress?: (completed: number, total: number, current: string) => void,
    onSuccess?: (results: ConnectionResult[]) => void,
    onError?: (error: string) => void
  ): Promise<ConnectionResult[]> {
    const results: ConnectionResult[] = []
    const total = connections.length

    try {
      for (let i = 0; i < connections.length; i++) {
        const { providerId, apiKey } = connections[i]
        
        onProgress?.(i, total, providerId)

        let result: ConnectionResult
        
        if (apiKey) {
          // API key connection
          result = await this.connectApiKey(providerId, apiKey)
        } else {
          // OAuth connection
          result = await this.startConnection({ providerId })
        }

        results.push(result)

        // Short delay between connections to avoid rate limiting
        if (i < connections.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      onProgress?.(total, total, "Complete")
      onSuccess?.(results)
      return results

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Batch connection failed"
      onError?.(errorMessage)
      return results
    }
  }

  /**
   * Refresh all expired tokens
   */
  static async refreshExpiredTokens(
    onProgress?: (refreshed: number, failed: number) => void,
    onSuccess?: (stats: { refreshed: number; failed: number }) => void,
    onError?: (error: string) => void
  ): Promise<{ refreshed: number; failed: number }> {
    try {
      const stats = await IntegrationService.refreshTokens()
      
      onProgress?.(stats.refreshed, stats.failed)
      onSuccess?.(stats)
      return stats

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Token refresh failed"
      onError?.(errorMessage)
      return { refreshed: 0, failed: 0 }
    }
  }

  /**
   * Get connection recommendations based on user's current integrations
   */
  static async getConnectionRecommendations(
    currentIntegrations: string[]
  ): Promise<{
    recommended: string[]
    reasons: Record<string, string[]>
  }> {
    // Smart recommendations based on existing integrations
    const recommendations: Record<string, string[]> = {
      'gmail': ['google-calendar', 'google-drive', 'slack'],
      'google-calendar': ['gmail', 'google-drive', 'slack'],
      'google-drive': ['gmail', 'google-calendar', 'notion'],
      'slack': ['gmail', 'google-calendar', 'trello', 'notion'],
      'discord': ['notion', 'trello'],
      'notion': ['google-drive', 'slack', 'trello'],
      'hubspot': ['gmail', 'slack', 'microsoft-teams'],
      'trello': ['slack', 'notion', 'google-calendar'],
      'airtable': ['slack', 'notion', 'google-drive']
    }

    const reasons: Record<string, string[]> = {
      'gmail': [
        'Seamless email automation workflows',
        'Enhanced productivity with calendar integration',
        'Centralized communication management'
      ],
      'google-calendar': [
        'Automated scheduling workflows',
        'Meeting coordination with email',
        'Event-driven automation'
      ],
      'slack': [
        'Team notification automation',
        'Centralized workflow updates',
        'Enhanced team collaboration'
      ],
      'notion': [
        'Automated documentation workflows',
        'Centralized project management',
        'Knowledge base automation'
      ]
    }

    const recommended = new Set<string>()
    
    currentIntegrations.forEach(integration => {
      const suggestions = recommendations[integration] || []
      suggestions.forEach(suggestion => {
        if (!currentIntegrations.includes(suggestion)) {
          recommended.add(suggestion)
        }
      })
    })

    return {
      recommended: Array.from(recommended),
      reasons
    }
  }

  /**
   * Validate all integration scopes and suggest upgrades
   */
  static async auditIntegrationScopes(
    integrations: Array<{ provider: string; scopes?: string[] }>
  ): Promise<{
    valid: string[]
    invalid: Array<{ provider: string; missingScopes: string[] }>
    upgrades: Array<{ provider: string; suggestedScopes: string[]; benefits: string[] }>
  }> {
    const valid: string[] = []
    const invalid: Array<{ provider: string; missingScopes: string[] }> = []
    const upgrades: Array<{ provider: string; suggestedScopes: string[]; benefits: string[] }> = []

    integrations.forEach(({ provider, scopes = [] }) => {
      // Validate current scopes
      const validation = ScopeValidator.validateScopes(provider, scopes)
      
      if (validation.isValid) {
        valid.push(provider)
      } else {
        invalid.push({
          provider,
          missingScopes: validation.missingScopes
        })
      }

      // Check for upgrade opportunities
      const upgradeOptions = ScopeValidator.suggestScopeUpgrades(provider, scopes)
      
      if (upgradeOptions.canUpgrade) {
        upgrades.push({
          provider,
          suggestedScopes: upgradeOptions.suggestedScopes,
          benefits: upgradeOptions.benefits
        })
      }
    })

    return { valid, invalid, upgrades }
  }
}