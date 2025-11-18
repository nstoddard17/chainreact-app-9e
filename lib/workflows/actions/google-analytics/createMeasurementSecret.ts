import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Creates a new measurement protocol API secret for a Google Analytics 4 data stream
 */
export async function createGoogleAnalyticsMeasurementSecret(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'google-analytics')

    // Get configuration values
    const propertyId = resolveValue(config.propertyId, input)
    const dataStreamId = resolveValue(config.dataStreamId, input)
    const displayName = resolveValue(config.displayName, input)

    if (!propertyId || !dataStreamId || !displayName) {
      return {
        success: false,
        message: 'Property ID, Data Stream ID, and Display Name are required',
      }
    }

    logger.debug(`[GA4 Create Measurement Secret] Creating secret for property ${propertyId}, stream ${dataStreamId}`)

    // Build the parent resource name
    const parent = `properties/${propertyId}/dataStreams/${dataStreamId}`

    // Create the measurement protocol secret
    const response = await fetch(
      `https://analyticsadmin.googleapis.com/v1beta/${parent}/measurementProtocolSecrets`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: displayName,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(error.error?.message || `Failed to create measurement secret: ${response.status}`)
    }

    const result = await response.json()

    logger.debug('[GA4 Create Measurement Secret] Successfully created secret:', result.name)

    return {
      success: true,
      output: {
        ...input,
        success: true,
        secret_value: result.secretValue,
        display_name: result.displayName,
        resource_name: result.name,
      },
      message: `Measurement protocol secret "${displayName}" created successfully`,
    }
  } catch (error: any) {
    logger.error('[GA4 Create Measurement Secret] Error:', error)
    return {
      success: false,
      message: `Failed to create measurement secret: ${error.message}`,
      error: error.message,
    }
  }
}
