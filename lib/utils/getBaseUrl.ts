export function getBaseUrl(): string {
  // Priority order: localhost detection > NEXT_PUBLIC_BASE_URL > NEXT_PUBLIC_APP_URL > fallback
  
  // FIRST: Check if we're running on localhost (highest priority for local development)
  if (typeof window !== 'undefined') {
    // Client-side
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `${window.location.protocol}//${window.location.host}`
    }
  } else {
    // Server-side - check NODE_ENV for development
    if (process.env.NODE_ENV === 'development') {
      const port = process.env.PORT || '3000'
      return `http://localhost:${port}`
    }
  }
  
  // If not localhost, check for explicit base URL configuration
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  
  // If NEXT_PUBLIC_APP_URL is set, use it
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  
  // Fallback to production URL
  return "https://chainreact.app"
}

// Separate function for API calls that should use localhost in development
export function getApiBaseUrl(): string {
  // Priority order: localhost detection > NEXT_PUBLIC_BASE_URL > NEXT_PUBLIC_APP_URL > fallback
  
  // FIRST: Check if we're running on localhost (highest priority for local development)
  if (typeof window !== 'undefined') {
    // Client-side - use the current window location to get the correct port
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `${window.location.protocol}//${window.location.host}`
    }
  } else {
    // Server-side
    if (process.env.NODE_ENV === 'development') {
      // Try to detect the actual port from the environment or fall back to 3000
      const port = process.env.PORT || '3000'
      return `http://localhost:${port}`
    }
  }
  
  // If not localhost, check for explicit base URL configuration
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  
  // If NEXT_PUBLIC_APP_URL is set, use it
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  
  // Fallback to production URL
  return "https://chainreact.app"
}

/**
 * Get webhook-specific base URL that supports environment-specific configuration
 * This function prioritizes environment variables and provides clear fallbacks
 */
export function getWebhookBaseUrl(): string {
  // Priority 1: Environment detection (localhost/ngrok takes precedence)
  if (typeof window !== 'undefined') {
    // Client-side detection
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${window.location.protocol}//${window.location.host}`
    }
    // Check for ngrok URLs
    if (hostname.includes('ngrok.io') || hostname.includes('ngrok-free.app')) {
      return `${window.location.protocol}//${window.location.host}`
    }
  } else {
    // Server-side detection
    if (process.env.NODE_ENV === 'development') {
      const port = process.env.PORT || '3000'
      return `http://localhost:${port}`
    }
  }
  
  // Priority 2: Explicit webhook base URL for testing
  if (process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL) {
    return process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL
  }
  
  // Priority 3: General base URL
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  
  // Priority 4: App URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  
  // Fallback to production URL
  return "https://chainreact.app"
}

/**
 * Get environment-specific webhook URL for a provider
 */
export function getWebhookUrl(provider: string): string {
  const baseUrl = getWebhookBaseUrl()
  return `${baseUrl}/api/webhooks/${provider}`
}

/**
 * Detect if we're running in a development environment
 */
export function isDevelopment(): boolean {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('ngrok')
  }
  return process.env.NODE_ENV === 'development'
}

/**
 * Detect if we're running in production
 */
export function isProduction(): boolean {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    return hostname === 'chainreact.app' || hostname.includes('vercel.app')
  }
  return process.env.NODE_ENV === 'production'
}

/**
 * Get environment name for display purposes
 */
export function getEnvironmentName(): string {
  if (isDevelopment()) {
    if (typeof window !== 'undefined' && window.location.hostname.includes('ngrok')) {
      return 'Development (ngrok)'
    }
    return 'Development (localhost)'
  }
  if (isProduction()) {
    return 'Production'
  }
  return 'Unknown'
}
