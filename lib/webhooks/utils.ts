/**
 * Utility functions for webhook management
 */

/**
 * Get the base URL for webhooks based on environment
 * In development, uses NEXT_PUBLIC_WEBHOOK_HTTPS_URL if available
 * In production or if env var not set, uses the request origin
 */
export function getWebhookBaseUrl(req?: Request): string {
  // In development, prefer the webhook HTTPS URL from environment
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL) {
    // Remove trailing slash if present
    return process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL.replace(/\/$/, '')
  }

  // If we have a request object, use its origin
  if (req) {
    const url = new URL(req.url)
    return url.origin
  }

  // Fallback to public URL environment variables
  if (process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL) {
    return process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL.replace(/\/$/, '')
  }

  if (process.env.NEXT_PUBLIC_URL) {
    return process.env.NEXT_PUBLIC_URL.replace(/\/$/, '')
  }

  // Last resort fallback
  return 'http://localhost:3000'
}

/**
 * Generate a full webhook URL for a specific endpoint
 * @param endpoint - The API endpoint path (e.g., '/api/webhooks/notion')
 * @param req - Optional request object to extract origin from
 */
export function getWebhookUrl(endpoint: string, req?: Request): string {
  const baseUrl = getWebhookBaseUrl(req)
  // Ensure endpoint starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${baseUrl}${normalizedEndpoint}`
}

/**
 * Get webhook URLs for all providers
 * Used when registering webhooks with external services
 */
export function getProviderWebhookUrls(req?: Request): Record<string, string> {
  const baseUrl = getWebhookBaseUrl(req)

  return {
    airtable: `${baseUrl}/api/workflow/airtable`,
    discord: `${baseUrl}/api/webhooks/discord`,
    github: `${baseUrl}/api/webhooks/github`,
    gmail: `${baseUrl}/api/webhooks/google`,
    'google-calendar': `${baseUrl}/api/webhooks/google`,
    'google-drive': `${baseUrl}/api/webhooks/google`,
    'google-sheets': `${baseUrl}/api/webhooks/google`,
    microsoft: `${baseUrl}/api/webhooks/microsoft`,
    notion: `${baseUrl}/api/webhooks/notion`,
    shopify: `${baseUrl}/api/webhooks/shopify`,
    slack: `${baseUrl}/api/webhooks/slack`,
    stripe: `${baseUrl}/api/webhooks/stripe-integration`,
    trello: `${baseUrl}/api/webhooks/trello`,
    twitter: `${baseUrl}/api/webhooks/twitter`,
    webhook: `${baseUrl}/api/custom-webhooks`,
  }
}

/**
 * Log webhook URL configuration for debugging
 */
export function logWebhookConfig(): void {
  console.log('🔧 Webhook Configuration:')
  console.log(`   NODE_ENV: ${process.env.NODE_ENV}`)
  console.log(`   NEXT_PUBLIC_WEBHOOK_HTTPS_URL: ${process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL || 'not set'}`)
  console.log(`   NEXT_PUBLIC_URL: ${process.env.NEXT_PUBLIC_URL || 'not set'}`)
  console.log(`   Computed base URL: ${getWebhookBaseUrl()}`)
}