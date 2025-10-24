/**
 * Google Analytics Get Real-Time Data Action
 * Fetches real-time analytics data from GA4
 */

import { ExecutionContext } from '../../executeNode'
import { google } from 'googleapis'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

export async function getGoogleAnalyticsRealtimeData(context: ExecutionContext): Promise<any> {
  const {
    propertyId,
    metrics,
    dimensions
  } = context.config

  logger.debug('[Google Analytics] Fetching real-time data:', {
    propertyId,
    metrics,
    dimensions
  })

  // Validate required fields
  if (!propertyId) {
    throw new Error('Property ID is required for fetching real-time data')
  }

  if (!metrics || (Array.isArray(metrics) && metrics.length === 0)) {
    throw new Error('At least one metric is required')
  }

  // Check test mode
  if (context.testMode) {
    logger.debug('[Google Analytics] Test mode - returning mock data')
    return {
      active_users: 42,
      page_views: 156,
      event_count: 89,
      data: {
        rows: [
          {
            dimensionValues: dimensions?.map(d => ({ value: `test_${d}` })) || [],
            metricValues: metrics.map(m => ({ value: '123' }))
          }
        ]
      },
      timestamp: new Date().toISOString(),
      testMode: true
    }
  }

  // Get the Google Analytics integration
  const integration = await context.getIntegration('google-analytics')
  if (!integration) {
    throw new Error('Google Analytics integration not found. Please connect your Google Analytics account.')
  }

  if (!integration.access_token) {
    throw new Error('Google Analytics access token not found. Please reconnect your account.')
  }

  try {
    // Decrypt the access token
    const decryptedToken = await decrypt(integration.access_token)
    const decryptedRefreshToken = integration.refresh_token ? await decrypt(integration.refresh_token) : null

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: decryptedToken,
      refresh_token: decryptedRefreshToken,
      token_type: 'Bearer'
    })

    // Create Analytics Data API client
    const analyticsData = google.analyticsdata({ version: 'v1beta', auth: oauth2Client })

    // Build metrics array
    const metricsArray = Array.isArray(metrics) ? metrics : [metrics]
    const requestMetrics = metricsArray.map(metric => ({ name: metric }))

    // Build dimensions array (optional)
    const requestDimensions = dimensions && Array.isArray(dimensions) && dimensions.length > 0
      ? dimensions.map(dimension => ({ name: dimension }))
      : undefined

    // Run the realtime report
    const response = await analyticsData.properties.runRealtimeReport({
      property: `properties/${propertyId}`,
      requestBody: {
        metrics: requestMetrics,
        dimensions: requestDimensions,
        limit: 100
      }
    })

    logger.debug('[Google Analytics] Real-time data fetched successfully')

    // Extract specific metrics from response
    const rows = response.data.rows || []
    const firstRow = rows[0]

    let activeUsers = 0
    let pageViews = 0
    let eventCount = 0

    if (firstRow && firstRow.metricValues) {
      // Find metric indices
      const metricHeaders = response.data.metricHeaders || []
      const activeUsersIndex = metricHeaders.findIndex(h => h.name === 'activeUsers')
      const pageViewsIndex = metricHeaders.findIndex(h => h.name === 'screenPageViews')
      const eventCountIndex = metricHeaders.findIndex(h => h.name === 'eventCount')

      if (activeUsersIndex >= 0 && firstRow.metricValues[activeUsersIndex]) {
        activeUsers = parseInt(firstRow.metricValues[activeUsersIndex].value || '0')
      }
      if (pageViewsIndex >= 0 && firstRow.metricValues[pageViewsIndex]) {
        pageViews = parseInt(firstRow.metricValues[pageViewsIndex].value || '0')
      }
      if (eventCountIndex >= 0 && firstRow.metricValues[eventCountIndex]) {
        eventCount = parseInt(firstRow.metricValues[eventCountIndex].value || '0')
      }
    }

    return {
      active_users: activeUsers,
      page_views: pageViews,
      event_count: eventCount,
      data: response.data,
      timestamp: new Date().toISOString()
    }
  } catch (error: any) {
    logger.error('[Google Analytics] Error fetching real-time data:', error)

    if (error.code === 401) {
      throw new Error('Google Analytics authentication expired. Please reconnect your account.')
    } else if (error.code === 403) {
      throw new Error('Insufficient permissions to access Google Analytics data.')
    }

    throw new Error(`Failed to fetch real-time data: ${error.message}`)
  }
}
