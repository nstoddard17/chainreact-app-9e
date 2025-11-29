/**
 * Monday.com Data API Utilities
 */

import { MondayIntegration } from './types'
import { decryptToken } from '@/lib/integrations/tokenUtils'
import { logger } from '@/lib/utils/logger'

/**
 * Validate Monday.com integration
 */
export function validateMondayIntegration(integration: MondayIntegration): void {
  if (!integration) {
    throw new Error('Monday.com integration not found')
  }

  if (!integration.access_token) {
    throw new Error('Monday.com access token is missing')
  }

  if (integration.status !== 'connected' && integration.status !== 'active') {
    throw new Error(`Monday.com integration is not connected (status: ${integration.status})`)
  }
}

/**
 * Get decrypted access token
 */
export async function getMondayAccessToken(integration: MondayIntegration): Promise<string> {
  try {
    logger.debug('🔑 [Monday Utils] Decrypting access token', {
      hasToken: !!integration.access_token,
      tokenLength: integration.access_token?.length,
      integrationId: integration.id
    })
    let decrypted: unknown = await decryptToken(integration.access_token)

    // Legacy tokens might be stored as JSON objects
    if (decrypted && typeof decrypted === 'object') {
      const tokenValue = (decrypted as { token?: unknown }).token
      decrypted = tokenValue
    }

    if (typeof decrypted !== 'string' || decrypted.length === 0) {
      throw new Error('Invalid Monday.com access token format')
    }

    logger.debug('🔑 [Monday Utils] Token decrypted successfully', {
      decryptedLength: decrypted.length
    })
    return decrypted
  } catch (error: any) {
    logger.error('❌ [Monday Utils] Failed to decrypt access token:', {
      error: error.message,
      integrationId: integration.id
    })
    throw new Error('Failed to decrypt Monday.com access token')
  }
}

/**
 * Make Monday.com GraphQL API request
 */
export async function makeMondayApiRequest(
  query: string,
  accessToken: string,
  variables?: Record<string, any>
): Promise<any> {
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('Invalid Monday.com access token')
  }

  try {
    logger.debug('🌐 [Monday Utils] Making API request', {
      hasToken: !!accessToken,
      tokenPrefix: `${accessToken.substring(0, 10)}...`,
      hasVariables: !!variables
    })

    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'API-Version': '2024-01'
      },
      body: JSON.stringify({
        query,
        variables
      })
    })

    logger.debug('🌐 [Monday Utils] API response received', {
      status: response.status,
      ok: response.ok
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('❌ [Monday Utils] API request failed', {
        status: response.status,
        errorText
      })
      throw new Error(`Monday.com API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    // Check for GraphQL errors
    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((e: any) => e.message).join(', ')
      throw new Error(`Monday.com GraphQL error: ${errorMessages}`)
    }

    return data.data
  } catch (error: any) {
    logger.error('❌ [Monday Utils] API request failed:', {
      message: error.message,
      status: error.status,
      stack: error.stack
    })
    throw error
  }
}
