/**
 * Google Analytics Integration Utilities
 */

import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { GoogleAnalyticsIntegration, GoogleAnalyticsApiError } from './types'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

/**
 * Create authenticated Google Analytics Admin API client
 */
export async function createGoogleAnalyticsAdminClient(integration: GoogleAnalyticsIntegration) {
  if (!integration.access_token) {
    throw new Error('No access token available')
  }

  const decryptedToken = await decrypt(integration.access_token)
  const decryptedRefreshToken = integration.refresh_token ? await decrypt(integration.refresh_token) : null

  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-analytics/callback`
  )

  oauth2Client.setCredentials({
    access_token: decryptedToken,
    refresh_token: decryptedRefreshToken,
    token_type: 'Bearer',
    expiry_date: integration.expires_at ? new Date(integration.expires_at).getTime() : undefined
  })

  // Check if token needs refresh
  if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken()
      oauth2Client.setCredentials(credentials)
      logger.debug('🔄 Refreshed Google Analytics access token')
    } catch (error) {
      logger.error('Failed to refresh token:', error)
      throw new Error('Authentication expired. Please reconnect your Google account.')
    }
  }

  return google.analyticsadmin({ version: 'v1beta', auth: oauth2Client })
}

/**
 * Create authenticated Google Analytics Data API client
 */
export async function createGoogleAnalyticsDataClient(integration: GoogleAnalyticsIntegration) {
  if (!integration.access_token) {
    throw new Error('No access token available')
  }

  const decryptedToken = await decrypt(integration.access_token)
  const decryptedRefreshToken = integration.refresh_token ? await decrypt(integration.refresh_token) : null

  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-analytics/callback`
  )

  oauth2Client.setCredentials({
    access_token: decryptedToken,
    refresh_token: decryptedRefreshToken,
    token_type: 'Bearer',
    expiry_date: integration.expires_at ? new Date(integration.expires_at).getTime() : undefined
  })

  return google.analyticsdata({ version: 'v1beta', auth: oauth2Client })
}

/**
 * Create Google Analytics API error with proper context
 */
export function createGoogleAnalyticsApiError(message: string, status?: number): GoogleAnalyticsApiError {
  const error = new Error(message) as GoogleAnalyticsApiError
  error.status = status
  error.name = 'GoogleAnalyticsApiError'

  if (status === 401) {
    error.message = 'Google Analytics authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Google Analytics API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Google Analytics API rate limit exceeded. Please try again later.'
  }

  return error
}

/**
 * Validate Google Analytics integration has required access token
 */
export function validateGoogleAnalyticsIntegration(integration: GoogleAnalyticsIntegration): void {
  if (!integration) {
    throw new Error('Google Analytics integration not found')
  }

  if (!integration.access_token) {
    throw new Error('Google Analytics authentication required. Please reconnect your account.')
  }

  if (integration.provider !== 'google-analytics') {
    throw new Error('Invalid integration provider. Expected Google Analytics.')
  }
}

/**
 * Parse property resource name to get property ID
 * Format: properties/{property_id}
 */
export function parsePropertyId(resourceName: string): string {
  const match = resourceName.match(/properties\/(.+)/)
  return match ? match[1] : resourceName
}

/**
 * Parse data stream resource name to get stream ID
 * Format: properties/{property_id}/dataStreams/{stream_id}
 */
export function parseStreamId(resourceName: string): string {
  const match = resourceName.match(/dataStreams\/(.+)/)
  return match ? match[1] : resourceName
}
