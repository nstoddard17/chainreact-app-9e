/**
 * Stripe Accounts Handler
 * Returns the current integration's account info with integration ID as value
 * for multi-account support in workflows
 */

import Stripe from 'stripe'
import { StripeIntegration, StripeDataHandler } from '../types'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

export interface StripeAccount {
  id: string
  value: string
  label: string
  accountId?: string
  accountName?: string
  email?: string
}

/**
 * Fetch Stripe account information
 * IMPORTANT: Returns integration ID as value so it can be used for multi-account support
 */
export const getStripeAccounts: StripeDataHandler<StripeAccount> = async (
  integration: StripeIntegration
): Promise<StripeAccount[]> => {
  try {
    if (!integration.access_token) {
      throw new Error('Stripe integration missing access token')
    }

    // Decrypt access token
    const accessToken = await decrypt(integration.access_token)

    // Initialize Stripe client
    const stripe = new Stripe(accessToken, {
      apiVersion: '2024-11-20.acacia'
    })

    logger.debug("💳 [Stripe Accounts] Fetching account info")

    // Get account information
    const account = await stripe.accounts.retrieve()

    // Build display label
    const displayLabel = account.business_profile?.name ||
                        account.settings?.dashboard?.display_name ||
                        account.email ||
                        `Stripe Account (${account.id})`

    // CRITICAL: Return integration ID as value, not Stripe account ID
    // This allows the trigger lifecycle to use this value to find the correct integration
    const accounts: StripeAccount[] = [{
      id: integration.id,
      value: integration.id, // CRITICAL: Use integration ID for multi-account support
      label: displayLabel,
      accountId: account.id,
      accountName: account.business_profile?.name || account.settings?.dashboard?.display_name,
      email: account.email || undefined
    }]

    logger.debug(`✅ [Stripe Accounts] Retrieved account: ${displayLabel} (integration: ${integration.id})`)
    return accounts

  } catch (error: any) {
    logger.error("❌ [Stripe Accounts] Error fetching accounts:", error)

    // If we can't fetch account info, still return a basic entry with integration ID
    // This allows the trigger to work even if account.retrieve fails
    return [{
      id: integration.id,
      value: integration.id,
      label: `Stripe Account (${integration.id.substring(0, 8)}...)`,
      accountId: undefined,
      accountName: undefined,
      email: undefined
    }]
  }
}
