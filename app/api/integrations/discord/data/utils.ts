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
 * Advanced Discord rate limiting with request queue
 */
let lastDiscordRequest = 0
const MIN_REQUEST_INTERVAL = 250 // 250ms between requests (more conservative to avoid rate limits)

// Track request counts per bucket with better management
const bucketData = new Map<string, { 
  count: number, 
  resetTime: number, 
  queue: Array<() => void> 
}>()
const MAX_REQUESTS_PER_BUCKET = 5 // More conservative limit to avoid rate limits
const BUCKET_RESET_BUFFER = 500 // 500ms buffer after bucket reset

// Global request queue to prevent overwhelming Discord API
const globalQueue: Array<{
  fn: () => Promise<Response>,
  resolve: (value: Response) => void,
  reject: (error: any) => void,
  retryCount: number
}> = []
let isProcessingQueue = false

// Enhanced cache for Discord API responses
const discordCache = new Map<string, { data: any, timestamp: number }>()
const CACHE_TTL = 600000 // 10 minutes cache to significantly reduce API calls

// Request deduplication map to prevent duplicate concurrent requests
const pendingRequests = new Map<string, Promise<any>>()

/**
 * Process the global request queue
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue || globalQueue.length === 0) {
    return
  }
  
  isProcessingQueue = true
  
  while (globalQueue.length > 0) {
    const now = Date.now()
    const timeSinceLastRequest = now - lastDiscordRequest
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest
      console.log(`⏱️ Global queue throttling: waiting ${waitTime}ms`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
    
    const queueItem = globalQueue.shift()
    if (!queueItem) break
    
    try {
      lastDiscordRequest = Date.now()
      const response = await queueItem.fn()
      queueItem.resolve(response)
    } catch (error) {
      queueItem.reject(error)
    }
    
    // More conservative delay between queue items to prevent overwhelming
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  isProcessingQueue = false
}

/**
 * Add request to queue and return promise
 */
function queueRequest(fetchFn: () => Promise<Response>): Promise<Response> {
  return new Promise((resolve, reject) => {
    globalQueue.push({
      fn: fetchFn,
      resolve,
      reject,
      retryCount: 0
    })
    
    // Start processing queue if not already running
    processQueue().catch(console.error)
  })
}

/**
 * Rate-limited Discord API request handler with improved queue management
 */
export async function fetchDiscordWithRateLimit<T>(
  fetchFn: () => Promise<Response>,
  maxRetries: number = 3,
  defaultWaitTime: number = 15000
): Promise<T> {
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use queue for all requests to prevent overwhelming Discord
      const response = await queueRequest(fetchFn)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`✅ Discord API success on attempt ${attempt}`)
        return data
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
        const retryAfterMs = response.headers.get('x-ratelimit-reset-after')
        const bucket = response.headers.get('x-ratelimit-bucket')
        
        // Use the most accurate retry time available
        let waitTime = defaultWaitTime
        if (retryAfterMs) {
          waitTime = Math.ceil(parseFloat(retryAfterMs) * 1000) + 2000 // Add 2 second buffer
        } else if (retryAfter) {
          waitTime = parseInt(retryAfter) * 1000 + 2000 // Add 2 second buffer
        }
        
        // Cap the wait time at 120 seconds for severe rate limits
        waitTime = Math.min(waitTime, 120000)
        
        console.log(`🚦 Discord rate limited (attempt ${attempt}/${maxRetries}), waiting ${waitTime}ms`)
        console.log(`📊 Rate limit details:`, {
          bucket: response.headers.get('x-ratelimit-bucket'),
          limit: response.headers.get('x-ratelimit-limit'),
          remaining: response.headers.get('x-ratelimit-remaining'),
          resetAfter: response.headers.get('x-ratelimit-reset-after'),
          scope: response.headers.get('x-ratelimit-scope')
        })
        
        // Update bucket tracking if we have bucket info
        if (bucket) {
          const resetTime = Date.now() + waitTime
          bucketData.set(bucket, {
            count: 0,
            resetTime,
            queue: []
          })
        }
        
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
      
      // Exponential backoff for general errors
      const backoffTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000) // Max 30 seconds
      console.log(`🔄 Discord request failed (attempt ${attempt}/${maxRetries}), retrying in ${backoffTime}ms...`)
      console.error(`   Error:`, error.message)
      await new Promise(resolve => setTimeout(resolve, backoffTime))
    }
  }
  
  throw new Error('Discord API request failed after all retries')
}

/**
 * Make authenticated request to Discord API with enhanced rate limiting and caching
 */
export async function makeDiscordApiRequest<T = any>(
  url: string, 
  accessToken: string, 
  options: RequestInit = {},
  useCache: boolean = true
): Promise<T> {
  // Create a unique request key for deduplication
  const requestKey = `${url}:${accessToken.slice(-8)}:${JSON.stringify(options.body || '')}`
  
  // Check cache for GET requests with more aggressive caching
  if (useCache && (!options.method || options.method === 'GET')) {
    const cacheKey = `${url}:${accessToken.slice(-8)}` // Use last 8 chars of token as part of key
    const cached = discordCache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`📦 Using cached Discord data for ${url} (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`)
      return cached.data
    }
    
    // Check if there's already a pending request for this exact same data
    const pendingRequest = pendingRequests.get(requestKey)
    if (pendingRequest) {
      console.log(`🔄 Reusing pending Discord request for ${url}`)
      return pendingRequest
    }
  }

  // Determine if this is a bot token or user token
  const authHeader = accessToken.startsWith('Bot ') ? accessToken : `Bearer ${accessToken}`

  console.log(`🔍 Making Discord API request to: ${url}`)
  
  // Create the request promise and store it for deduplication
  const requestPromise = fetchDiscordWithRateLimit<T>(() => 
    fetch(url, {
      ...options,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  )
  
  // Store the pending request for deduplication
  if (useCache && (!options.method || options.method === 'GET')) {
    pendingRequests.set(requestKey, requestPromise)
  }
  
  try {
    const data = await requestPromise
    
    // Cache successful GET requests
    if (useCache && (!options.method || options.method === 'GET')) {
      const cacheKey = `${url}:${accessToken.slice(-8)}`
      discordCache.set(cacheKey, { data, timestamp: Date.now() })
      console.log(`📦 Cached Discord response for ${url}`)
    }
    
    return data
  } finally {
    // Clean up pending request
    if (useCache && (!options.method || options.method === 'GET')) {
      pendingRequests.delete(requestKey)
    }
  }
}

/**
 * Legacy function for backward compatibility
 */
export async function makeDiscordApiRequestLegacy(
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