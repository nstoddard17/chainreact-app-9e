/**
 * Google Analytics Measurement Protocol Secret Manager
 * Automatically creates and manages API secrets for sending events
 */

import { google } from 'googleapis'
import { logger } from '@/lib/utils/logger'
import { decrypt, encrypt } from '@/lib/security/encryption'

interface GoogleAnalyticsIntegration {
  id: string
  user_id: string
  access_token: string
  refresh_token?: string
  metadata?: Record<string, any>
}

interface MeasurementProtocolSecret {
  measurementId: string
  propertyId: string
  dataStreamId: string
  secretValue: string
  createdAt: string
}

/**
 * Get or create a Measurement Protocol API secret for a given data stream
 * This allows sending events without requiring users to manually create API secrets
 */
export async function getOrCreateApiSecret(
  integration: GoogleAnalyticsIntegration,
  propertyId: string,
  dataStreamId: string,
  supabase: any
): Promise<string> {
  try {
    // Check if we already have a secret for this data stream in metadata
    const secretKey = `mp_secret_${propertyId}_${dataStreamId}`

    if (integration.metadata?.[secretKey]) {
      logger.debug('[GA Secret Manager] Using existing API secret from metadata')
      // Decrypt and return existing secret
      return await decrypt(integration.metadata[secretKey])
    }

    logger.debug('[GA Secret Manager] No existing secret found, creating new one via Admin API')

    // Decrypt the access token
    const accessToken = await decrypt(integration.access_token)

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create Admin API client
    const analyticsAdmin = google.analyticsadmin({ version: 'v1beta', auth: oauth2Client })

    // Create a new Measurement Protocol secret
    const response = await analyticsAdmin.properties.dataStreams.measurementProtocolSecrets.create({
      parent: `properties/${propertyId}/dataStreams/${dataStreamId}`,
      requestBody: {
        displayName: 'ChainReact Automation'
      }
    })

    const secretValue = response.data.secretValue
    if (!secretValue) {
      throw new Error('Failed to create API secret: No secret value returned')
    }

    logger.debug('[GA Secret Manager] Successfully created new API secret')

    // Encrypt the secret
    const encryptedSecret = await encrypt(secretValue)

    // Store in integration metadata
    const updatedMetadata = {
      ...(integration.metadata || {}),
      [secretKey]: encryptedSecret
    }

    // Update the integration in database
    const { error } = await supabase
      .from('integrations')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', integration.id)

    if (error) {
      logger.error('[GA Secret Manager] Failed to save API secret to database:', error)
      throw new Error(`Failed to save API secret: ${error.message}`)
    }

    logger.debug('[GA Secret Manager] API secret saved to database')

    return secretValue
  } catch (error: any) {
    logger.error('[GA Secret Manager] Error managing API secret:', error)

    // Handle specific API errors
    if (error.code === 401 || error.message?.includes('authentication')) {
      throw new Error('Google Analytics authentication expired. Please reconnect your account.')
    }

    if (error.code === 403 || error.message?.includes('permission')) {
      throw new Error('Insufficient permissions to create API secrets. Please ensure the analytics.edit scope is granted.')
    }

    if (error.code === 404) {
      throw new Error(`Data stream not found. Please verify the property ID (${propertyId}) and data stream ID (${dataStreamId}) are correct.`)
    }

    throw new Error(`Failed to get or create API secret: ${error.message}`)
  }
}

/**
 * Extract property ID and data stream ID from a measurement ID
 * Measurement IDs look like: G-XXXXXXXXXX
 * We need to find the corresponding property and stream IDs
 */
export async function getPropertyAndStreamIds(
  integration: GoogleAnalyticsIntegration,
  measurementId: string
): Promise<{ propertyId: string; dataStreamId: string }> {
  try {
    logger.debug('[GA Secret Manager] Looking up property and stream IDs for measurement ID:', measurementId)

    // Decrypt the access token
    const accessToken = await decrypt(integration.access_token)

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create Admin API client
    const analyticsAdmin = google.analyticsadmin({ version: 'v1beta', auth: oauth2Client })

    // List all account summaries to find the property
    const accountSummariesResponse = await analyticsAdmin.accountSummaries.list()
    const accountSummaries = accountSummariesResponse.data.accountSummaries || []

    // Search through all properties for the matching measurement ID
    for (const accountSummary of accountSummaries) {
      const propertySummaries = accountSummary.propertySummaries || []

      for (const propertySummary of propertySummaries) {
        const propertyName = propertySummary.property // Format: properties/123456
        if (!propertyName) continue

        const propertyId = propertyName.split('/')[1]

        // List data streams for this property
        const dataStreamsResponse = await analyticsAdmin.properties.dataStreams.list({
          parent: propertyName
        })

        const dataStreams = dataStreamsResponse.data.dataStreams || []

        // Find the stream with matching measurement ID
        for (const stream of dataStreams) {
          if (stream.webStreamData?.measurementId === measurementId) {
            const streamName = stream.name // Format: properties/123456/dataStreams/789012
            const dataStreamId = streamName?.split('/')[3] || ''

            logger.debug('[GA Secret Manager] Found matching property and stream:', {
              propertyId,
              dataStreamId,
              measurementId
            })

            return { propertyId, dataStreamId }
          }
        }
      }
    }

    throw new Error(`Could not find property and data stream for measurement ID: ${measurementId}`)
  } catch (error: any) {
    logger.error('[GA Secret Manager] Error looking up property/stream IDs:', error)

    if (error.code === 401 || error.message?.includes('authentication')) {
      throw new Error('Google Analytics authentication expired. Please reconnect your account.')
    }

    if (error.code === 403 || error.message?.includes('permission')) {
      throw new Error('Insufficient permissions to access GA4 properties. Please ensure the analytics.readonly scope is granted.')
    }

    throw new Error(`Failed to lookup property and stream IDs: ${error.message}`)
  }
}
