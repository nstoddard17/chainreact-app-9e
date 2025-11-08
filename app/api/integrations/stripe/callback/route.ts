import { type NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'

/**
 * Stripe OAuth Callback Handler
 *
 * Handles the OAuth callback from Stripe Connect.
 * Stripe uses client_secret (OAuth secret, not API secret) for token exchange.
 *
 * Updated: 2025-11-08 - Fixed to use STRIPE_CLIENT_SECRET (OAuth secret)
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
    additionalIntegrationData: (tokenData) => ({
      metadata: {
        stripe_publishable_key: tokenData.stripe_publishable_key,
        stripe_user_id: tokenData.stripe_user_id,
        livemode: tokenData.livemode,
      }
    }),
  })
}
