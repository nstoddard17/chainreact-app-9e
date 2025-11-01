import { type NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'

/**
 * Stripe OAuth Callback Handler
 *
 * Handles the OAuth callback from Stripe Connect.
 * Stripe uses a unique OAuth flow with client_secret instead of client_id.
 *
 * Updated: 2025-10-28 - Migrated to use oauth-callback-handler utility
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'stripe',
    tokenEndpoint: 'https://connect.stripe.com/oauth/token',
    clientId: '', // Stripe doesn't use client_id in token exchange
    clientSecret: process.env.STRIPE_SECRET_KEY!,
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
