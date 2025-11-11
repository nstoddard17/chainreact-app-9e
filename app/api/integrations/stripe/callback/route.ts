import { type NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { logger } from '@/lib/utils/logger'

/**
 * Stripe OAuth Callback Handler
 *
 * Handles the OAuth callback from Stripe Connect.
 * Stripe uses client_secret (OAuth secret, not API secret) for token exchange.
 *
 * Updated: 2025-11-10 - Added email fetching from Stripe account API
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'stripe',
    tokenEndpoint: 'https://connect.stripe.com/oauth/token',
    clientId: '', // Stripe doesn't use client_id in token exchange
    clientSecret: process.env.STRIPE_CLIENT_SECRET!,
    getRedirectUri: () => '', // Stripe doesn't require redirect_uri in token exchange
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: null, // Stripe tokens don't expire
    }),
    additionalIntegrationData: async (tokenData, state) => {
      // Fetch Stripe account information
      // API VERIFICATION: Stripe API endpoint for account details
      // Docs: https://stripe.com/docs/api/accounts/retrieve
      // Returns: email, business_profile, settings, etc.
      try {
        const accountResponse = await fetch('https://api.stripe.com/v1/account', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'Stripe-Version': '2023-10-16',
          },
        })

        if (!accountResponse.ok) {
          logger.warn('Failed to fetch Stripe account info:', accountResponse.status)
          return {
            stripe_publishable_key: tokenData.stripe_publishable_key,
            stripe_user_id: tokenData.stripe_user_id,
            livemode: tokenData.livemode,
          }
        }

        const accountInfo = await accountResponse.json()

        return {
          email: accountInfo.email || null,
          username: accountInfo.email?.split('@')[0] || accountInfo.id || null,
          account_name: accountInfo.business_profile?.name || accountInfo.settings?.dashboard?.display_name || accountInfo.email || null,
          provider_user_id: accountInfo.id,
          stripe_publishable_key: tokenData.stripe_publishable_key,
          stripe_user_id: tokenData.stripe_user_id,
          livemode: tokenData.livemode,
          country: accountInfo.country,
          business_type: accountInfo.business_type,
        }
      } catch (error) {
        logger.error('Error fetching Stripe account info:', error)
        return {
          stripe_publishable_key: tokenData.stripe_publishable_key,
          stripe_user_id: tokenData.stripe_user_id,
          livemode: tokenData.livemode,
        }
      }
    },
  })
}
