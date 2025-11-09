/**
 * Google Analytics Measurement IDs Handler
 */

import { GoogleAnalyticsIntegration, GoogleAnalyticsMeasurementId, GoogleAnalyticsDataHandler } from '../types'
import { createGoogleAnalyticsAdminClient, parseStreamId } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getGoogleAnalyticsMeasurementIds: GoogleAnalyticsDataHandler<GoogleAnalyticsMeasurementId[]> = async (
  integration: GoogleAnalyticsIntegration,
  options?: { propertyId?: string }
): Promise<GoogleAnalyticsMeasurementId[]> => {
  try {
    if (!options?.propertyId) {
      throw new Error('Property ID is required to fetch measurement IDs')
    }

    const analyticsAdmin = await createGoogleAnalyticsAdminClient(integration)

    // List data streams for the property
    const response = await analyticsAdmin.properties.dataStreams.list({
      parent: `properties/${options.propertyId}`,
      pageSize: 200
    })

    const measurementIds: GoogleAnalyticsMeasurementId[] = []

    if (response.data.dataStreams) {
      for (const stream of response.data.dataStreams) {
        // Only include web streams (they have measurement IDs like G-XXXXXXXXXX)
        if (stream.type === 'WEB_DATA_STREAM' && stream.webStreamData?.measurementId) {
          const streamId = stream.name ? parseStreamId(stream.name) : stream.webStreamData.measurementId

          measurementIds.push({
            id: streamId,
            name: stream.displayName || stream.webStreamData.measurementId,
            measurementId: stream.webStreamData.measurementId,
            propertyId: options.propertyId
          })
        }
      }
    }

    logger.debug(`✅ [Google Analytics] Fetched ${measurementIds.length} measurement IDs for property ${options.propertyId}`)
    return measurementIds

  } catch (error: any) {
    logger.error('❌ [Google Analytics] Error fetching measurement IDs:', {
      message: error?.message,
      code: error?.code,
      status: error?.status,
      statusCode: error?.statusCode,
      name: error?.name,
      response: error?.response?.data,
      stack: error?.stack
    })

    // Handle specific API errors
    const errorCode = error?.code || error?.status || error?.statusCode

    if (errorCode === 401 || error?.message?.includes('authentication') || error?.message?.includes('expired')) {
      throw new Error('Google Analytics authentication expired. Please reconnect your account.')
    } else if (errorCode === 403 || error?.message?.includes('permission')) {
      throw new Error('Insufficient permissions to access Google Analytics data streams.')
    } else if (errorCode === 404 || error?.message?.includes('not found')) {
      throw new Error('Property not found. Please check the property ID.')
    }

    throw new Error(error.message || 'Error fetching Google Analytics measurement IDs')
  }
}
