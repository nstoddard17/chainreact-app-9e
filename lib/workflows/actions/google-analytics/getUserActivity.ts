/**
 * Google Analytics Get User Activity Action
 * Retrieves activity data for a specific user
 */

import { ExecutionContext } from '../../executeNode'
import { google } from 'googleapis'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

/**
 * Calculate date from days ago
 */
function getDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().split('T')[0]
}

export async function getGoogleAnalyticsUserActivity(context: ExecutionContext): Promise<any> {
  const {
    propertyId,
    userId,
    dateRange = 'last_30_days'
  } = context.config

  logger.debug('[Google Analytics] Fetching user activity:', {
    propertyId,
    userId,
    dateRange
  })

  // Validate required fields
  if (!propertyId) {
    throw new Error('Property ID is required for fetching user activity')
  }

  if (!userId) {
    throw new Error('User ID is required')
  }

  // Check test mode
  if (context.testMode) {
    logger.debug('[Google Analytics] Test mode - returning mock user activity')
    return {
      user_id: userId,
      activity: [
        {
          timestamp: new Date().toISOString(),
          event: 'page_view',
          page: '/home'
        }
      ],
      total_events: 42,
      total_sessions: 5,
      first_seen: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen: new Date().toISOString(),
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

    // Calculate date range
    let daysAgo = 30
    if (dateRange === 'last_7_days') daysAgo = 7
    else if (dateRange === 'last_90_days') daysAgo = 90

    const startDate = getDaysAgo(daysAgo)
    const endDate = getDaysAgo(0)

    // Run report filtered by user ID
    const response = await analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'date' },
          { name: 'eventName' },
          { name: 'pagePath' }
        ],
        metrics: [
          { name: 'eventCount' },
          { name: 'sessions' }
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'userId',
            stringFilter: {
              matchType: 'EXACT',
              value: userId
            }
          }
        },
        limit: 1000,
        orderBys: [
          {
            dimension: {
              dimensionName: 'date',
              orderType: 'NUMERIC'
            },
            desc: true
          }
        ]
      }
    })

    logger.debug('[Google Analytics] User activity fetched successfully:', {
      rowCount: response.data.rows?.length || 0
    })

    // Transform the data
    const activity = (response.data.rows || []).map(row => {
      const date = row.dimensionValues?.[0]?.value || ''
      const eventName = row.dimensionValues?.[1]?.value || ''
      const pagePath = row.dimensionValues?.[2]?.value || ''
      const eventCount = parseInt(row.metricValues?.[0]?.value || '0')

      return {
        date,
        timestamp: date ? new Date(date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toISOString() : '',
        event: eventName,
        page: pagePath,
        count: eventCount
      }
    })

    // Calculate totals
    let totalEvents = 0
    let totalSessions = 0

    for (const row of response.data.rows || []) {
      totalEvents += parseInt(row.metricValues?.[0]?.value || '0')
      totalSessions += parseInt(row.metricValues?.[1]?.value || '0')
    }

    // Get first and last seen dates
    const firstSeen = activity.length > 0 ? activity[activity.length - 1].timestamp : null
    const lastSeen = activity.length > 0 ? activity[0].timestamp : null

    return {
      user_id: userId,
      activity,
      total_events: totalEvents,
      total_sessions: totalSessions,
      first_seen: firstSeen,
      last_seen: lastSeen
    }
  } catch (error: any) {
    logger.error('[Google Analytics] Error fetching user activity:', error)

    if (error.code === 401) {
      throw new Error('Google Analytics authentication expired. Please reconnect your account.')
    } else if (error.code === 403) {
      throw new Error('Insufficient permissions to access Google Analytics data.')
    }

    throw new Error(`Failed to fetch user activity: ${error.message}`)
  }
}
