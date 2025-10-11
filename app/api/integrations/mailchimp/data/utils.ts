/**
 * Mailchimp API Utilities
 */

import { MailchimpIntegration } from './types'
import { decrypt } from '@/lib/security/encryption'

/**
 * Decrypt Mailchimp access token
 */
function getDecryptedToken(integration: MailchimpIntegration): string {
  const encryptionKey = process.env.ENCRYPTION_KEY
  if (!encryptionKey) {
    throw new Error('Encryption key not configured')
  }

  if (!integration.access_token) {
    throw new Error('Mailchimp access token not found')
  }

  try {
    return decrypt(integration.access_token, encryptionKey)
  } catch (error) {
    console.error('Failed to decrypt Mailchimp token:', error)
    throw new Error('Failed to decrypt Mailchimp access token. Please reconnect your account.')
  }
}

/**
 * Validate Mailchimp integration
 */
export function validateMailchimpIntegration(integration: MailchimpIntegration): void {
  if (!integration) {
    throw new Error('Mailchimp integration not found')
  }

  if (integration.status !== 'connected') {
    throw new Error('Mailchimp integration is not connected. Please reconnect your account.')
  }

  if (!integration.access_token) {
    throw new Error('Mailchimp access token not found')
  }
}

/**
 * Get Mailchimp server prefix from metadata or token
 */
export function getMailchimpServerPrefix(integration: MailchimpIntegration): string {
  // Try to get from metadata first (OAuth flow)
  if (integration.metadata?.dc) {
    console.log(`📍 [Mailchimp] Using server prefix from metadata: ${integration.metadata.dc}`)
    return integration.metadata.dc
  }

  // Try to get from api_endpoint in metadata
  if (integration.metadata?.api_endpoint) {
    const match = integration.metadata.api_endpoint.match(/https:\/\/([^.]+)\.api\.mailchimp\.com/)
    if (match && match[1]) {
      console.log(`📍 [Mailchimp] Extracted server prefix from api_endpoint: ${match[1]}`)
      return match[1]
    }
  }

  // Parse from access_token if it contains the server prefix
  // Some API keys are formatted as: {api_key}-{server_prefix}
  // Note: Need to decrypt the token first
  try {
    const decryptedToken = getDecryptedToken(integration)
    const tokenParts = decryptedToken.split('-')
    if (tokenParts.length > 1) {
      const potentialPrefix = tokenParts[tokenParts.length - 1]
      // Validate it looks like a server prefix (us1, us2, etc.)
      if (potentialPrefix.match(/^[a-z]{2}\d+$/)) {
        console.log(`📍 [Mailchimp] Extracted server prefix from token: ${potentialPrefix}`)
        return potentialPrefix
      }
    }
  } catch (error) {
    console.warn('Failed to decrypt token for server prefix extraction:', error)
  }

  // Cannot determine server - this is a critical error
  throw new Error('Cannot determine Mailchimp server prefix. Please reconnect your Mailchimp account.')
}

/**
 * Build Mailchimp API URL
 */
export function buildMailchimpApiUrl(integration: MailchimpIntegration, path: string): string {
  const serverPrefix = getMailchimpServerPrefix(integration)
  const baseUrl = `https://${serverPrefix}.api.mailchimp.com/3.0`

  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path : `/${path}`

  return `${baseUrl}${cleanPath}`
}

/**
 * Make authenticated Mailchimp API request
 */
export async function makeMailchimpApiRequest(url: string, accessToken: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('Mailchimp API error:', {
      status: response.status,
      statusText: response.statusText,
      url,
      error: errorData
    })

    if (response.status === 401) {
      throw new Error('Mailchimp authentication failed. Please reconnect your account.')
    }

    if (response.status === 429) {
      throw new Error('Mailchimp API rate limit exceeded. Please try again later.')
    }

    throw new Error(errorData.title || errorData.detail || `Mailchimp API error: ${response.statusText}`)
  }

  return response
}

/**
 * Parse Mailchimp API response
 */
export async function parseMailchimpApiResponse<T = any>(response: Response): Promise<T[]> {
  const data = await response.json()

  // Mailchimp typically returns arrays in a property (e.g., lists, members, campaigns)
  // Try to find the array in common property names
  if (Array.isArray(data)) {
    return data
  }

  // Check common array property names
  const arrayProps = ['lists', 'members', 'campaigns', 'merge_fields', 'tags', 'templates', 'segments']
  for (const prop of arrayProps) {
    if (data[prop] && Array.isArray(data[prop])) {
      return data[prop]
    }
  }

  // If we have a single object, wrap it in an array
  if (typeof data === 'object' && data !== null) {
    return [data]
  }

  return []
}

/**
 * Validate Mailchimp API token
 */
export async function validateMailchimpToken(integration: MailchimpIntegration): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    validateMailchimpIntegration(integration)

    // Decrypt the token
    const decryptedToken = getDecryptedToken(integration)

    // Test the token by making a simple API call
    const url = buildMailchimpApiUrl(integration, '/ping')
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${decryptedToken}`,
      },
    })

    if (!response.ok) {
      return {
        success: false,
        error: 'Mailchimp token validation failed. Please reconnect your account.'
      }
    }

    return {
      success: true,
      token: decryptedToken
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Token validation failed'
    }
  }
}
