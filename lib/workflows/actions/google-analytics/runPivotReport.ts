/**
 * Google Analytics Run Pivot Report Action
 * Runs pivot reports with custom metrics, dimensions, and pivots
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

export async function runGoogleAnalyticsPivotReport(context: ExecutionContext): Promise<any> {
  const {
    propertyId,
    dateRange,
    startDate,
    endDate,
    metrics,
    dimensions,
    pivotDimensions,
    limit = 100
  } = context.config

  logger.debug('[Google Analytics] Running pivot report:', {
    propertyId,
    dateRange,
    metrics,
    dimensions,
    pivotDimensions,
    limit
  })

  // Validate required fields
  if (!propertyId) {
    throw new Error('Property ID is required for running reports')
  }

  if (!dateRange) {
    throw new Error('Date range is required')
  }

  if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
    throw new Error('At least one metric is required')
  }

  // Check test mode
  if (context.testMode) {
    logger.debug('[Google Analytics] Test mode - returning mock pivot report data')
    return {
      success: true,
      output: {
        pivot_data: [
          {
            dimensions: dimensions?.map(d => `test_${d}`) || [],
            metrics: metrics.map(m => 123)
          }
        ],
        row_count: 1,
        column_headers: pivotDimensions?.map(d => `test_${d}`) || [],
        date_range: { startDate: '2024-01-01', endDate: '2024-01-31' },
        metrics,
        dimensions: [...(dimensions || []), ...(pivotDimensions || [])]
      },
      message: 'Pivot report generated with 1 rows (test mode)'
    }
  }

  try {
    // Get the Google Analytics integration
    const integration = await context.getIntegration('google-analytics')
    if (!integration) {
      throw new Error('Google Analytics integration not found. Please connect your Google Analytics account.')
    }

    if (!integration.access_token) {
      throw new Error('Google Analytics access token not found. Please reconnect your account.')
    }

    const accessToken = await decrypt(integration.access_token)
    const refreshToken = integration.refresh_token ? await decrypt(integration.refresh_token) : null

    // Setup OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    const analyticsData = google.analyticsdata({ version: 'v1beta', auth: oauth2Client })

    // Get the actual date range
    const dates = getDateRange(dateRange, startDate, endDate)

    // Build the request body
    const requestBody: any = {
      dateRanges: [
        {
          startDate: dates.startDate,
          endDate: dates.endDate
        }
      ],
      metrics: metrics.map((m: string) => ({ name: m }))
    }

    // Add row dimensions
    if (dimensions && Array.isArray(dimensions) && dimensions.length > 0) {
      requestBody.dimensions = dimensions.map((d: string) => ({ name: d }))
    }

    // Add pivot configuration
    if (pivotDimensions && Array.isArray(pivotDimensions) && pivotDimensions.length > 0) {
      requestBody.pivots = [
        {
          fieldNames: pivotDimensions,
          limit: Math.min(limit, 250), // GA4 max pivot limit is 250
          orderBys: [
            {
              metric: {
                metricName: metrics[0]
              },
              desc: true
            }
          ]
        }
      ]
    }

    // Run the pivot report
    const response = await analyticsData.properties.runPivotReport({
      property: `properties/${propertyId}`,
      requestBody
    })

    const { data } = response

    // Extract pivot headers
    const columnHeaders = data.pivotHeaders?.[0]?.pivotDimensionHeaders?.map((header: any) =>
      header.dimensionValues?.map((v: any) => v.value).join(' - ')
    ) || []

    // Process the pivot data
    const pivotData = data.rows?.map((row: any) => {
      const rowData: any = {}

      // Add dimension values
      row.dimensionValues?.forEach((value: any, index: number) => {
        const dimensionName = dimensions?.[index] || `dimension_${index}`
        rowData[dimensionName] = value.value
      })

      // Add metric values
      row.metricValues?.forEach((value: any, index: number) => {
        const metricName = metrics[index] || `metric_${index}`
        rowData[metricName] = parseFloat(value.value) || value.value
      })

      return rowData
    }) || []

    logger.debug('[Google Analytics] Pivot report completed with', pivotData.length, 'rows')

    return {
      success: true,
      output: {
        pivot_data: pivotData,
        row_count: pivotData.length,
        column_headers: columnHeaders,
        date_range: dates,
        metrics,
        dimensions: [...(dimensions || []), ...(pivotDimensions || [])]
      },
      message: `Pivot report generated with ${pivotData.length} rows`
    }

  } catch (error: any) {
    logger.error('[Google Analytics] Pivot report error:', error)

    throw new Error(
      error.message || 'Failed to run pivot report'
    )
  }
}
