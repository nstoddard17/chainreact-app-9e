/**
 * Google Analytics Properties Handler
 */

import { GoogleAnalyticsIntegration, GoogleAnalyticsProperty, GoogleAnalyticsDataHandler } from '../types'
import { createGoogleAnalyticsAdminClient, parsePropertyId } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getGoogleAnalyticsProperties: GoogleAnalyticsDataHandler<GoogleAnalyticsProperty[]> = async (
  integration: GoogleAnalyticsIntegration,
  options?: { accountId?: string }
): Promise<GoogleAnalyticsProperty[]> => {
  try {
    const analyticsAdmin = await createGoogleAnalyticsAdminClient(integration)

    // List all account summaries (includes properties)
    const response = await analyticsAdmin.accountSummaries.list({
      pageSize: 200
    })

    const properties: GoogleAnalyticsProperty[] = []

    if (response.data.accountSummaries) {
      for (const accountSummary of response.data.accountSummaries) {
        // Filter by account if specified
        if (options?.accountId) {
          const accountId = accountSummary.account?.replace('accounts/', '')
          if (accountId !== options.accountId) {
            continue
          }
        }

        if (accountSummary.propertySummaries) {
          for (const propertySummary of accountSummary.propertySummaries) {
            if (propertySummary.property && propertySummary.displayName) {
              const propertyId = parsePropertyId(propertySummary.property)

              properties.push({
                id: propertyId,
                name: propertySummary.property,
                displayName: propertySummary.displayName,
              })
            }
          }
        }
      }
    }

    logger.debug(`✅ [Google Analytics] Fetched ${properties.length} properties${options?.accountId ? ` for account ${options.accountId}` : ''}`)
    return properties

  } catch (error: any) {
    logger.error('❌ [Google Analytics] Error fetching properties:', error)

    // Handle specific API errors
    if (error.code === 401) {
      throw new Error('Google Analytics authentication expired. Please reconnect your account.')
    } else if (error.code === 403) {
      throw new Error('Insufficient permissions to access Google Analytics properties.')
    }

    throw new Error(error.message || 'Error fetching Google Analytics properties')
  }
}
