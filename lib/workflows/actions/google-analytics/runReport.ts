/**
 * Google Analytics Run Report Action
 * Runs custom analytics reports with specified metrics and dimensions
 */

import { ExecutionContext } from '../../executeNode'
import { google } from 'googleapis'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

/**
 * Convert date range string to actual dates
 */
function getDateRange(dateRange: string, startDate?: string, endDate?: string): { startDate: string; endDate: string } {
  const today = new Date()
  const formatDate = (date: Date) => date.toISOString().split('T')[0]

  switch (dateRange) {
    case 'today':
      return { startDate: formatDate(today), endDate: formatDate(today) }
    case 'yesterday':
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { startDate: formatDate(yesterday), endDate: formatDate(yesterday) }
    case 'last_7_days':
      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      return { startDate: formatDate(sevenDaysAgo), endDate: formatDate(today) }
    case 'last_30_days':
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return { startDate: formatDate(thirtyDaysAgo), endDate: formatDate(today) }
    case 'last_90_days':
      const ninetyDaysAgo = new Date(today)
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      return { startDate: formatDate(ninetyDaysAgo), endDate: formatDate(today) }
    case 'this_month':
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      return { startDate: formatDate(firstDayOfMonth), endDate: formatDate(today) }
    case 'last_month':
      const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
      return { startDate: formatDate(firstDayOfLastMonth), endDate: formatDate(lastDayOfLastMonth) }
    case 'custom':
      if (!startDate || !endDate) {
        throw new Error('Start date and end date are required for custom date range')
      }
      return { startDate, endDate }
    default:
      throw new Error(`Unknown date range: ${dateRange}`)
  }
}

export async function runGoogleAnalyticsReport(context: ExecutionContext): Promise<any> {
  const {
    propertyId,
    dateRange,
    startDate,
    endDate,
    metrics,
    dimensions,
    limit = 100
  } = context.config

  logger.debug('[Google Analytics] Running report:', {
    propertyId,
    dateRange,
    metrics,
    dimensions,
    limit
  })

  // Validate required fields
  if (!propertyId) {
    throw new Error('Property ID is required for running reports')
  }

  if (!dateRange) {
    throw new Error('Date range is required')
  }

  if (!metrics || (Array.isArray(metrics) && metrics.length === 0)) {
    throw new Error('At least one metric is required')
  }

  // Check test mode
  if (context.testMode) {
    logger.debug('[Google Analytics] Test mode - returning mock report data')
    return {
      report_data: [
        {
          dimensions: dimensions?.map(d => `test_${d}`) || [],
          metrics: metrics.map(m => 123)
        }
      ],
      total_rows: 1,
      date_range: { startDate: '2024-01-01', endDate: '2024-01-31' },
      metrics,
      dimensions: dimensions || [],
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
    const dates = getDateRange(dateRange, startDate, endDate)

    // Build metrics array
    const metricsArray = Array.isArray(metrics) ? metrics : [metrics]
    const requestMetrics = metricsArray.map(metric => ({ name: metric }))

    // Build dimensions array (optional)
    const requestDimensions = dimensions && Array.isArray(dimensions) && dimensions.length > 0
      ? dimensions.map(dimension => ({ name: dimension }))
      : undefined

    // Run the report
    const response = await analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [dates],
        metrics: requestMetrics,
        dimensions: requestDimensions,
        limit: parseInt(String(limit)),
        keepEmptyRows: false
      }
    })

    logger.debug('[Google Analytics] Report run successfully:', {
      rowCount: response.data.rows?.length || 0
    })

    // Transform the data into a more user-friendly format
    const reportData = (response.data.rows || []).map(row => {
      const dimensionValues = row.dimensionValues?.map(d => d.value) || []
      const metricValues = row.metricValues?.map(m => parseFloat(m.value || '0')) || []

      const record: any = {}

      // Add dimensions
      if (dimensionValues.length > 0 && requestDimensions) {
        requestDimensions.forEach((dim, index) => {
          record[dim.name || `dimension_${index}`] = dimensionValues[index]
        })
      }

      // Add metrics
      if (metricValues.length > 0) {
        requestMetrics.forEach((metric, index) => {
          record[metric.name || `metric_${index}`] = metricValues[index]
        })
      }

      return record
    })

    return {
      report_data: reportData,
      total_rows: reportData.length,
      date_range: dates,
      metrics: metricsArray,
      dimensions: dimensions || []
    }
  } catch (error: any) {
    logger.error('[Google Analytics] Error running report:', error)

    if (error.code === 401) {
      throw new Error('Google Analytics authentication expired. Please reconnect your account.')
    } else if (error.code === 403) {
      throw new Error('Insufficient permissions to access Google Analytics data.')
    }

    throw new Error(`Failed to run report: ${error.message}`)
  }
}
