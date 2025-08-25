/**
 * Discord Integration Utilities
 */

import { DiscordApiError } from './types'

/**
 * Create Discord API error with proper context
 */
export function createDiscordApiError(message: string, status?: number, response?: Response): DiscordApiError {
  const error = new Error(message) as DiscordApiError
  error.status = status
  error.name = 'DiscordApiError'
  
  if (status === 401) {
    error.message = 'Discord authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Discord API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Discord API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Discord resource not found. Check if the server or channel still exists.'
  }
  
  return error
}

/**
 * Validate Discord integration has required access token
 */
export function validateDiscordIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Discord integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Discord authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'discord') {
    throw new Error('Invalid integration provider. Expected Discord.')
  }
  
  // Note: We're lenient about status since we have a valid access token
  // The main requirement is having an access token, not a specific status
}

/**
 * Global rate limiting state for Discord API
 */
let lastDiscordRequest = 0
const MIN_REQUEST_INTERVAL = 2000 // 2 seconds between requests

/**
 * Rate-limited Discord API request handler
 */
export async function fetchDiscordWithRateLimit<T>(
  fetchFn: () => Promise<Response>,
  maxRetries: number = 3,
  defaultWaitTime: number = 10000
): Promise<T> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastDiscordRequest
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest
    console.log(`⏱️ Throttling Discord API: waiting ${waitTime}ms between requests`)
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      lastDiscordRequest = Date.now()
      const response = await fetchFn()
      
      if (response.ok) {
        return await response.json()
      }
      
      // Log detailed error information
      const errorText = await response.text().catch(() => 'Could not read response text')
      console.error(`❌ Discord API Error (attempt ${attempt}/${maxRetries}):`, {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorText
      })
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after')
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : defaultWaitTime
        console.log(`🚦 Discord rate limited (attempt ${attempt}/${maxRetries}), waiting ${waitTime}ms`)
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
      }
      
      throw createDiscordApiError(
        `Discord API error: ${response.status} - ${response.statusText} - ${errorText}`,
        response.status,
        response
      )
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw error
      }
      console.log(`🔄 Discord request failed (attempt ${attempt}/${maxRetries}), retrying...`)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
  
  throw new Error('Discord API request failed after all retries')
}

/**
 * Make authenticated request to Discord API with rate limiting
 */
export async function makeDiscordApiRequest(
  url: string, 
  accessToken: string, 
  options: RequestInit = {}
): Promise<Response> {
  return fetchDiscordWithRateLimit(() => 
    fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  )
}

/**
 * Get standard Discord API headers
 */
export function getDiscordApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Format Discord user display name
 */
export function formatDiscordUser(user: any): string {
  if (user.global_name) {
    return user.global_name
  }
  if (user.discriminator && user.discriminator !== '0') {
    return `${user.username}#${user.discriminator}`
  }
  return user.username || 'Unknown User'
}

/**
 * Get Discord avatar URL
 */
export function getDiscordAvatarUrl(user: any, size: number = 128): string {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=${size}`
  }
  // Default avatar
  const defaultAvatarIndex = user.discriminator ? parseInt(user.discriminator) % 5 : 0
  return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`
}

/**
 * Format Discord channel name
 */
export function formatChannelName(channel: any): string {
  if (channel.type === 0) { // Text channel
    return `#${channel.name}`
  } else if (channel.type === 2) { // Voice channel
    return `🔊 ${channel.name}`
  } else if (channel.type === 4) { // Category
    return `📁 ${channel.name}`
  } else if (channel.type === 5) { // Announcement channel
    return `📢 ${channel.name}`
  }
  return channel.name
}

/**
 * Discord token validation with proper decryption
 */
export async function validateDiscordToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // Decrypt the access token
    const { decrypt } = await import('@/lib/security/encryption')
    const decryptedToken = decrypt(integration.access_token)
    
    if (!decryptedToken) {
      return {
        success: false,
        error: "Failed to decrypt access token"
      }
    }

    return {
      success: true,
      token: decryptedToken
    }
  } catch (error: any) {
    console.error('Discord token validation error:', error)
    return {
      success: false,
      error: error.message || "Token validation failed"
    }
  }
}