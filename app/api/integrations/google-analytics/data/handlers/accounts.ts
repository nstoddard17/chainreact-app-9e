/**
 * Google Analytics Accounts Handler
 */

import { GoogleAnalyticsIntegration, GoogleAnalyticsAccount, GoogleAnalyticsDataHandler } from '../types'
import { createGoogleAnalyticsAdminClient } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getGoogleAnalyticsAccounts: GoogleAnalyticsDataHandler<GoogleAnalyticsAccount[]> = async (
  integration: GoogleAnalyticsIntegration
): Promise<GoogleAnalyticsAccount[]> => {
  try {
    const analyticsAdmin = await createGoogleAnalyticsAdminClient(integration)

    // List all account summaries
    const response = await analyticsAdmin.accountSummaries.list({
      pageSize: 200
    })

    const accounts: GoogleAnalyticsAccount[] = []
    const accountMap = new Map<string, GoogleAnalyticsAccount>()

    if (response.data.accountSummaries) {
      for (const accountSummary of response.data.accountSummaries) {
        if (accountSummary.account && accountSummary.displayName) {
          // Extract account ID from resource name (format: accounts/{account_id})
          const accountId = accountSummary.account.replace('accounts/', '')

          // Avoid duplicates
          if (!accountMap.has(accountId)) {
            accountMap.set(accountId, {
              id: accountId,
              name: accountSummary.account,
              displayName: accountSummary.displayName,
            })
          }
        }
      }
    }

    // Convert map to array
    accounts.push(...accountMap.values())

    logger.debug(`✅ [Google Analytics] Fetched ${accounts.length} accounts`)
    return accounts

  } catch (error: any) {
    logger.error('❌ [Google Analytics] Error fetching accounts:', error)

    // Handle specific API errors
    if (error.code === 401) {
      throw new Error('Google Analytics authentication expired. Please reconnect your account.')
    } else if (error.code === 403) {
      throw new Error('Insufficient permissions to access Google Analytics accounts.')
    }

    throw new Error(error.message || 'Error fetching Google Analytics accounts')
  }
}
