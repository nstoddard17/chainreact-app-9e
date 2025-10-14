import { FetchUserDataRequest, FetchUserDataResponse } from '@/types/integration'
import { configValidator } from '@/lib/config/validator'

import { logger } from '@/lib/utils/logger'

/**
 * Protected API client that validates requests and responses
 * This prevents common issues like missing parameters or wrong data types
 */
export class ProtectedApiClient {
  private static instance: ProtectedApiClient

  private constructor() {}

  static getInstance(): ProtectedApiClient {
    if (!ProtectedApiClient.instance) {
      ProtectedApiClient.instance = new ProtectedApiClient()
    }
    return ProtectedApiClient.instance
  }

  /**
   * Validates fetch-user-data request parameters
   */
  private validateFetchUserDataRequest(request: any): request is FetchUserDataRequest {
    if (!request || typeof request !== 'object') {
      throw new Error('Request must be an object')
    }

    if (!request.integrationId || typeof request.integrationId !== 'string') {
      throw new Error('integrationId is required and must be a string')
    }

    if (!request.dataType || typeof request.dataType !== 'string') {
      throw new Error('dataType is required and must be a string')
    }

    if (request.options && typeof request.options !== 'object') {
      throw new Error('options must be an object if provided')
    }

    return true
  }

  /**
   * Validates fetch-user-data response
   */
  private validateFetchUserDataResponse(response: any): response is FetchUserDataResponse {
    if (!response || typeof response !== 'object') {
      throw new Error('Response must be an object')
    }

    if (typeof response.success !== 'boolean') {
      throw new Error('Response must have a boolean success field')
    }

    if (response.success && !Array.isArray(response.data)) {
      throw new Error('Successful response must have a data array')
    }

    if (!response.success && !response.error) {
      throw new Error('Error response must have an error field')
    }

    return true
  }

  /**
   * Protected fetch-user-data call with validation
   */
  async fetchUserData(request: FetchUserDataRequest): Promise<FetchUserDataResponse> {
    try {
      // Validate request
      this.validateFetchUserDataRequest(request)

      // Validate configuration before making request
      configValidator.requireValidConfig('encryption')

      // Make the actual API call
      const response = await fetch('/api/integrations/fetch-user-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAuthToken()}`
        },
        body: JSON.stringify(request)
      })

      const responseData = await response.json()

      // Validate response
      this.validateFetchUserDataResponse(responseData)

      return responseData
    } catch (error) {
      logger.error('Protected API client error:', error)
      
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          details: 'Protected API client validation failed'
        }
      }
    }
  }

  /**
   * Get authentication token
   */
  private async getAuthToken(): Promise<string> {
    // This should be implemented based on your auth system
    // For now, we'll throw an error if not implemented
    throw new Error('Authentication token retrieval not implemented')
  }

  /**
   * Validate Discord bot configuration before making Discord API calls
   */
  validateDiscordBotConfig(): void {
    const validation = configValidator.validateDiscordBotConfig()
    if (!validation.isValid) {
      throw new Error(`Discord bot configuration invalid: ${validation.missingVars.join(', ')}`)
    }
  }

  /**
   * Validate OAuth configuration for a specific provider
   */
  validateOAuthConfig(provider: string): void {
    const validation = configValidator.validateOAuthConfig(provider)
    if (!validation.isValid) {
      throw new Error(`${provider} OAuth configuration invalid: ${validation.missingVars.join(', ')}`)
    }
  }
}

// Export singleton instance
export const protectedApiClient = ProtectedApiClient.getInstance() 