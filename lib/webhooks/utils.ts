import { logger } from '@/lib/utils/logger'

/**
 * Utility functions for webhook management
 */

/**
 * Get the base URL for webhooks based on environment
 * In development, uses NEXT_PUBLIC_WEBHOOK_HTTPS_URL if available
 * In production or if env var not set, uses the request origin
 */
export function getWebhookBaseUrl(req?: Request): string {
  const envWebhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL
  const envPublicUrl = process.env.NEXT_PUBLIC_URL
  const envVercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined

  if (process.env.NODE_ENV === 'development') {
    if (envWebhookUrl) return envWebhookUrl.replace(/\/$/, '')
    if (req) {
      const url = new URL(req.url)
      return url.origin
    }
    if (envPublicUrl) return envPublicUrl.replace(/\/$/, '')
    if (envVercelUrl) return envVercelUrl.replace(/\/$/, '')
    return 'http://localhost:3000'
  }

  // Production: prefer explicit public URL envs, then request origin
  if (envPublicUrl) return envPublicUrl.replace(/\/$/, '')
  if (envWebhookUrl) return envWebhookUrl.replace(/\/$/, '')
  if (envVercelUrl) return envVercelUrl.replace(/\/$/, '')
  if (req) {
    const url = new URL(req.url)
    return url.origin
  }

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
  logger.debug('🔧 Webhook Configuration:')
  logger.debug(`   NODE_ENV: ${process.env.NODE_ENV}`)
  logger.debug(`   NEXT_PUBLIC_WEBHOOK_HTTPS_URL: ${process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL || 'not set'}`)
  logger.debug(`   NEXT_PUBLIC_URL: ${process.env.NEXT_PUBLIC_URL || 'not set'}`)
  logger.debug(`   Computed base URL: ${getWebhookBaseUrl()}`)
}
